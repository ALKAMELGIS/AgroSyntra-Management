import { dbPool } from '../db/client';

export interface UserSiteAssignment {
  id: string;
  userId: string;
  siteId: string;
  assignedBy: string | null;
  createdAt: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  siteName?: string;
}

export interface UserFarmAreaAssignment {
  id: string;
  userId: string;
  farmAreaId: string;
  assignedBy: string | null;
  createdAt: string;
  userName?: string;
  farmAreaName?: string;
  siteName?: string;
}

export interface UserFieldAssignment {
  id: string;
  userId: string;
  fieldId: string;
  assignedBy: string | null;
  createdAt: string;
  userName?: string;
  fieldName?: string;
  farmAreaName?: string;
}

export interface UserZoneAssignment {
  id: string;
  userId: string;
  countryId: string;
  assignedBy: string | null;
  createdAt: string;
  countryName?: string;
  countryCode?: string;
}

/**
 * SQL condition: the farm manager whose id is in parameter `$userParam` can
 * reach the site aliased `siteAlias`. True when the site is assigned to them
 * directly, or when it sits inside a zone (country) assigned to them. The
 * caller still checks the site's organization.
 */
export function farmManagerSiteAccessSql(siteAlias: string, userParam: string): string {
  return `(
    EXISTS (
      SELECT 1 FROM user_site_assignments usa_fm
       WHERE usa_fm.user_id = ${userParam}::uuid AND usa_fm.site_id = ${siteAlias}.id
    )
    OR EXISTS (
      SELECT 1 FROM user_zone_assignments uza_fm
        JOIN countries c_fm ON c_fm.id = uza_fm.country_id
       WHERE uza_fm.user_id = ${userParam}::uuid
         AND uza_fm.country_id = ${siteAlias}.country_id
         AND c_fm.organization_id = ${siteAlias}.organization_id
         AND c_fm.deleted_at IS NULL
    )
  )`;
}

export class AssignmentRepository {
  // ============ Zone Assignments (farm managers) ============

  async assignUserToZone(userId: string, countryId: string, assignedBy: string): Promise<UserZoneAssignment | null> {
    const result = await dbPool.query(
      `INSERT INTO user_zone_assignments (user_id, country_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, country_id) DO NOTHING
       RETURNING *`,
      [userId, countryId, assignedBy],
    );
    return result.rows[0] ? this.mapZoneAssignment(result.rows[0]) : null;
  }

  async removeUserFromZone(userId: string, countryId: string): Promise<boolean> {
    const result = await dbPool.query(
      'DELETE FROM user_zone_assignments WHERE user_id = $1 AND country_id = $2',
      [userId, countryId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getUserZoneAssignments(userId: string, organizationId: string): Promise<UserZoneAssignment[]> {
    const result = await dbPool.query(
      `SELECT uza.*, c.name AS country_name, c.code AS country_code
         FROM user_zone_assignments uza
         JOIN countries c ON c.id = uza.country_id
        WHERE uza.user_id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL
        ORDER BY c.name`,
      [userId, organizationId],
    );
    return result.rows.map((r) => this.mapZoneAssignment(r));
  }

  /** Zones assigned directly to a farm manager (the zones they may manage). */
  async getUserAssignedZoneIds(userId: string, role: string, organizationId: string): Promise<string[]> {
    if (role !== 'farm_manager') return [];
    const result = await dbPool.query(
      `SELECT uza.country_id
         FROM user_zone_assignments uza
         JOIN countries c ON c.id = uza.country_id
        WHERE uza.user_id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL`,
      [userId, organizationId],
    );
    return result.rows.map((r) => r.country_id);
  }

  /** True when the zone is assigned to this farm manager and belongs to the org. */
  async isZoneAssignedToUser(userId: string, role: string, countryId: string, organizationId: string): Promise<boolean> {
    if (role !== 'farm_manager') return false;
    const result = await dbPool.query(
      `SELECT 1 FROM user_zone_assignments uza
         JOIN countries c ON c.id = uza.country_id
        WHERE uza.user_id = $1 AND uza.country_id = $2
          AND c.organization_id = $3 AND c.deleted_at IS NULL`,
      [userId, countryId, organizationId],
    );
    return result.rows.length > 0;
  }

  /**
   * Zones the user can see. CEO: every zone in the org. Farm manager: the
   * zones assigned to them (even with no sites yet) plus the zones of their
   * accessible sites. Everyone else: the zones of their accessible sites.
   */
  async getUserAccessibleZoneIds(userId: string, role: string, organizationId: string): Promise<string[]> {
    if (role === 'ceo') {
      const result = await dbPool.query(
        'SELECT id FROM countries WHERE organization_id = $1 AND deleted_at IS NULL',
        [organizationId],
      );
      return result.rows.map((r) => r.id);
    }
    const siteIds = await this.getUserAccessibleSiteIds(userId, role, organizationId);
    const ids = new Set<string>(await this.getUserAssignedZoneIds(userId, role, organizationId));
    if (siteIds.length > 0) {
      const result = await dbPool.query(
        'SELECT DISTINCT country_id FROM sites WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
        [siteIds],
      );
      result.rows.forEach((r) => ids.add(r.country_id));
    }
    return Array.from(ids);
  }

  // ============ Site Assignments ============
  async assignUserToSite(userId: string, siteId: string, assignedBy: string): Promise<UserSiteAssignment> {
    const result = await dbPool.query(
      `INSERT INTO user_site_assignments (user_id, site_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, site_id) DO NOTHING
       RETURNING *`,
      [userId, siteId, assignedBy]
    );
    return this.mapSiteAssignment(result.rows[0]);
  }

  async removeUserFromSite(userId: string, siteId: string): Promise<void> {
    await dbPool.query(
      'DELETE FROM user_site_assignments WHERE user_id = $1 AND site_id = $2',
      [userId, siteId]
    );
  }

  async getUserSiteAssignments(userId: string): Promise<UserSiteAssignment[]> {
    const result = await dbPool.query(
      `SELECT usa.*, s.name as site_name
       FROM user_site_assignments usa
       JOIN sites s ON usa.site_id = s.id
       WHERE usa.user_id = $1`,
      [userId]
    );
    return result.rows.map(this.mapSiteAssignment);
  }

  async getSiteUsers(siteId: string): Promise<UserSiteAssignment[]> {
    const result = await dbPool.query(
      `SELECT usa.*, u.name as user_name, u.email as user_email, u.role as user_role
       FROM user_site_assignments usa
       JOIN users u ON usa.user_id = u.id
       WHERE usa.site_id = $1
       ORDER BY u.name`,
      [siteId]
    );
    return result.rows.map(this.mapSiteAssignment);
  }

  async getUserAccessibleSiteIds(userId: string, role: string, organizationId: string): Promise<string[]> {
    if (role === 'ceo') {
      const result = await dbPool.query(
        'SELECT id FROM sites WHERE organization_id = $1 AND deleted_at IS NULL',
        [organizationId],
      );
      return result.rows.map(r => r.id);
    }

    if (role === 'farm_manager') {
      // Sites inside the farm manager's zones, plus sites assigned directly.
      const result = await dbPool.query(
        `SELECT s.id FROM sites s
          WHERE s.organization_id = $2 AND s.deleted_at IS NULL
            AND ${farmManagerSiteAccessSql('s', '$1')}`,
        [userId, organizationId],
      );
      return result.rows.map(r => r.id);
    }

    const result = await dbPool.query(
      `SELECT usa.site_id
       FROM user_site_assignments usa
       JOIN sites s ON s.id = usa.site_id
       WHERE usa.user_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL`,
      [userId, organizationId],
    );
    return result.rows.map(r => r.site_id);
  }

  // ============ Farm Area Assignments ============
  
  async assignUserToFarmArea(userId: string, farmAreaId: string, assignedBy: string): Promise<UserFarmAreaAssignment> {
    const result = await dbPool.query(
      `INSERT INTO user_farm_area_assignments (user_id, farm_area_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, farm_area_id) DO NOTHING
       RETURNING *`,
      [userId, farmAreaId, assignedBy]
    );
    return this.mapFarmAreaAssignment(result.rows[0]);
  }

  async removeUserFromFarmArea(userId: string, farmAreaId: string): Promise<void> {
    await dbPool.query(
      'DELETE FROM user_farm_area_assignments WHERE user_id = $1 AND farm_area_id = $2',
      [userId, farmAreaId]
    );
  }

  async getUserFarmAreaAssignments(userId: string): Promise<UserFarmAreaAssignment[]> {
    const result = await dbPool.query(
      `SELECT ufa.*, fa.name as farm_area_name, s.name as site_name
       FROM user_farm_area_assignments ufa
       JOIN farm_areas fa ON ufa.farm_area_id = fa.id
       JOIN sites s ON fa.site_id = s.id
       WHERE ufa.user_id = $1`,
      [userId]
    );
    return result.rows.map(this.mapFarmAreaAssignment);
  }

  async getUserAccessibleFarmAreaIds(userId: string, role: string, organizationId: string): Promise<string[]> {
    if (role === 'ceo') {
      const result = await dbPool.query(
        `SELECT fa.id FROM farm_areas fa
         JOIN sites s ON s.id = fa.site_id
         WHERE s.organization_id = $1 AND fa.deleted_at IS NULL AND s.deleted_at IS NULL`,
        [organizationId],
      );
      return result.rows.map(r => r.id);
    }

    if (role === 'farm_manager') {
      const result = await dbPool.query(
        `SELECT fa.id FROM farm_areas fa
           JOIN sites s ON s.id = fa.site_id
          WHERE s.organization_id = $2 AND s.deleted_at IS NULL AND fa.deleted_at IS NULL
            AND ${farmManagerSiteAccessSql('s', '$1')}
         UNION
         SELECT ufa.farm_area_id FROM user_farm_area_assignments ufa
           JOIN farm_areas fa2 ON fa2.id = ufa.farm_area_id
           JOIN sites s2 ON s2.id = fa2.site_id
          WHERE ufa.user_id = $1 AND s2.organization_id = $2`,
        [userId, organizationId],
      );
      return result.rows.map(r => r.id);
    }

    if (role === 'operation_manager') {
      const result = await dbPool.query(
        `SELECT DISTINCT fa.id
         FROM farm_areas fa
         JOIN sites s ON s.id = fa.site_id
         JOIN user_site_assignments usa ON usa.site_id = fa.site_id
         WHERE usa.user_id = $1 AND s.organization_id = $2
         UNION
         SELECT ufa.farm_area_id FROM user_farm_area_assignments ufa
         JOIN farm_areas fa2 ON fa2.id = ufa.farm_area_id
         JOIN sites s2 ON s2.id = fa2.site_id
         WHERE ufa.user_id = $1 AND s2.organization_id = $2`,
        [userId, organizationId],
      );
      return result.rows.map(r => r.id);
    }

    const result = await dbPool.query(
      `SELECT DISTINCT fa.id
         FROM farm_areas fa
         JOIN sites s ON s.id = fa.site_id
         JOIN user_site_assignments usa ON usa.site_id = fa.site_id
         WHERE usa.user_id = $1 AND s.organization_id = $2
       UNION
       SELECT ufa.farm_area_id FROM user_farm_area_assignments ufa
       JOIN farm_areas fa2 ON fa2.id = ufa.farm_area_id
       JOIN sites s2 ON s2.id = fa2.site_id
       WHERE ufa.user_id = $1 AND s2.organization_id = $2`,
      [userId, organizationId],
    );
    return result.rows.map(r => r.id);
  }

  // ============ Field Assignments ============
  
  async assignUserToField(userId: string, fieldId: string, assignedBy: string): Promise<UserFieldAssignment> {
    const result = await dbPool.query(
      `INSERT INTO user_field_assignments (user_id, field_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, field_id) DO NOTHING
       RETURNING *`,
      [userId, fieldId, assignedBy]
    );
    return this.mapFieldAssignment(result.rows[0]);
  }

  async removeUserFromField(userId: string, fieldId: string): Promise<void> {
    await dbPool.query(
      'DELETE FROM user_field_assignments WHERE user_id = $1 AND field_id = $2',
      [userId, fieldId]
    );
  }

  async getUserFieldAssignments(userId: string): Promise<UserFieldAssignment[]> {
    const result = await dbPool.query(
      `SELECT uff.*, f.name as field_name, fa.name as farm_area_name
       FROM user_field_assignments uff
       JOIN fields f ON uff.field_id = f.id
       JOIN farm_areas fa ON f.farm_area_id = fa.id
       WHERE uff.user_id = $1`,
      [userId]
    );
    return result.rows.map(this.mapFieldAssignment);
  }

  async getUserAccessibleFieldIds(userId: string, role: string, organizationId: string): Promise<string[]> {
    if (role === 'ceo') {
      const result = await dbPool.query(
        'SELECT id FROM fields WHERE organization_id = $1 AND deleted_at IS NULL',
        [organizationId],
      );
      return result.rows.map(r => r.id);
    }

    if (role === 'farm_manager') {
      const result = await dbPool.query(
        `SELECT f.id FROM fields f
           JOIN farm_areas fa ON f.farm_area_id = fa.id
           JOIN sites s ON fa.site_id = s.id
          WHERE s.organization_id = $2 AND s.deleted_at IS NULL AND f.deleted_at IS NULL
            AND ${farmManagerSiteAccessSql('s', '$1')}
         UNION
         SELECT f.id FROM fields f
           JOIN user_farm_area_assignments ufa ON ufa.farm_area_id = f.farm_area_id
           JOIN farm_areas fa2 ON fa2.id = f.farm_area_id
           JOIN sites s2 ON fa2.site_id = s2.id
          WHERE ufa.user_id = $1 AND s2.organization_id = $2
         UNION
         SELECT uff.field_id FROM user_field_assignments uff
           JOIN fields f2 ON f2.id = uff.field_id
          WHERE uff.user_id = $1 AND f2.organization_id = $2`,
        [userId, organizationId],
      );
      return result.rows.map(r => r.id);
    }

    if (role === 'operation_manager') {
      const result = await dbPool.query(
        `SELECT DISTINCT f.id
         FROM fields f
         JOIN farm_areas fa ON f.farm_area_id = fa.id
         JOIN sites s ON fa.site_id = s.id
         JOIN user_site_assignments usa ON usa.site_id = fa.site_id
         WHERE usa.user_id = $1 AND s.organization_id = $2
         UNION
         SELECT f.id FROM fields f
         JOIN user_farm_area_assignments ufa ON ufa.farm_area_id = f.farm_area_id
         JOIN farm_areas fa2 ON fa2.id = f.farm_area_id
         JOIN sites s2 ON fa2.site_id = s2.id
         WHERE ufa.user_id = $1 AND s2.organization_id = $2
         UNION
         SELECT uff.field_id FROM user_field_assignments uff
         JOIN fields f2 ON f2.id = uff.field_id
         WHERE uff.user_id = $1 AND f2.organization_id = $2`,
        [userId, organizationId],
      );
      return result.rows.map(r => r.id);
    }

    const result = await dbPool.query(
      `SELECT DISTINCT f.id
         FROM fields f
         JOIN farm_areas fa ON f.farm_area_id = fa.id
         JOIN sites s ON fa.site_id = s.id
         JOIN user_site_assignments usa ON usa.site_id = fa.site_id
         WHERE usa.user_id = $1 AND s.organization_id = $2
       UNION
       SELECT DISTINCT f.id FROM fields f
         JOIN user_farm_area_assignments ufa ON ufa.farm_area_id = f.farm_area_id
         JOIN farm_areas fa2 ON fa2.id = f.farm_area_id
         JOIN sites s2 ON fa2.site_id = s2.id
         WHERE ufa.user_id = $1 AND s2.organization_id = $2
       UNION
       SELECT uff.field_id FROM user_field_assignments uff
       JOIN fields f2 ON f2.id = uff.field_id
       WHERE uff.user_id = $1 AND f2.organization_id = $2`,
      [userId, organizationId],
    );
    return result.rows.map(r => r.id);
  }

  // ============ Check Access ============
  
  async canUserAccessSite(userId: string, role: string, siteId: string, organizationId: string): Promise<boolean> {
    if (role === 'ceo') {
      const result = await dbPool.query(
        'SELECT 1 FROM sites WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
        [siteId, organizationId],
      );
      return result.rows.length > 0;
    }

    if (role === 'farm_manager') {
      const result = await dbPool.query(
        `SELECT 1 FROM sites s
          WHERE s.id = $2 AND s.organization_id = $3 AND s.deleted_at IS NULL
            AND ${farmManagerSiteAccessSql('s', '$1')}`,
        [userId, siteId, organizationId],
      );
      return result.rows.length > 0;
    }

    const result = await dbPool.query(
      `SELECT 1 FROM user_site_assignments usa
       JOIN sites s ON s.id = usa.site_id
       WHERE usa.user_id = $1 AND usa.site_id = $2 AND s.organization_id = $3`,
      [userId, siteId, organizationId],
    );
    return result.rows.length > 0;
  }

  async canUserAccessFarmArea(userId: string, role: string, farmAreaId: string, organizationId: string): Promise<boolean> {
    if (role === 'ceo') {
      const result = await dbPool.query(
        `SELECT 1 FROM farm_areas fa
         JOIN sites s ON s.id = fa.site_id
         WHERE fa.id = $1 AND s.organization_id = $2`,
        [farmAreaId, organizationId],
      );
      return result.rows.length > 0;
    }

    const directResult = await dbPool.query(
      `SELECT 1 FROM user_farm_area_assignments ufa
       JOIN farm_areas fa ON fa.id = ufa.farm_area_id
       JOIN sites s ON s.id = fa.site_id
       WHERE ufa.user_id = $1 AND ufa.farm_area_id = $2 AND s.organization_id = $3`,
      [userId, farmAreaId, organizationId],
    );
    if (directResult.rows.length > 0) return true;

    if (role === 'farm_manager') {
      const fmResult = await dbPool.query(
        `SELECT 1 FROM farm_areas fa
           JOIN sites s ON s.id = fa.site_id
          WHERE fa.id = $2 AND s.organization_id = $3 AND s.deleted_at IS NULL
            AND ${farmManagerSiteAccessSql('s', '$1')}`,
        [userId, farmAreaId, organizationId],
      );
      return fmResult.rows.length > 0;
    }

    const siteResult = await dbPool.query(
      `SELECT 1 FROM user_site_assignments usa
       JOIN farm_areas fa ON fa.site_id = usa.site_id
       JOIN sites s ON s.id = fa.site_id
       WHERE usa.user_id = $1 AND fa.id = $2 AND s.organization_id = $3`,
      [userId, farmAreaId, organizationId],
    );
    return siteResult.rows.length > 0;
  }

  async canUserAccessField(userId: string, role: string, fieldId: string, organizationId: string): Promise<boolean> {
    if (role === 'ceo') {
      const result = await dbPool.query(
        'SELECT 1 FROM fields WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
        [fieldId, organizationId],
      );
      return result.rows.length > 0;
    }

    const fieldResult = await dbPool.query(
      `SELECT 1 FROM user_field_assignments uff
       JOIN fields f ON f.id = uff.field_id
       WHERE uff.user_id = $1 AND uff.field_id = $2 AND f.organization_id = $3`,
      [userId, fieldId, organizationId],
    );
    if (fieldResult.rows.length > 0) return true;

    const farmAreaResult = await dbPool.query(
      `SELECT 1 FROM user_farm_area_assignments ufa
       JOIN fields f ON f.farm_area_id = ufa.farm_area_id
       WHERE ufa.user_id = $1 AND f.id = $2 AND f.organization_id = $3`,
      [userId, fieldId, organizationId],
    );
    if (farmAreaResult.rows.length > 0) return true;

    if (role === 'farm_manager') {
      const fmResult = await dbPool.query(
        `SELECT 1 FROM fields f
           JOIN farm_areas fa ON fa.id = f.farm_area_id
           JOIN sites s ON s.id = fa.site_id
          WHERE f.id = $2 AND f.organization_id = $3 AND s.deleted_at IS NULL
            AND ${farmManagerSiteAccessSql('s', '$1')}`,
        [userId, fieldId, organizationId],
      );
      return fmResult.rows.length > 0;
    }

    const siteResult = await dbPool.query(
      `SELECT 1 FROM user_site_assignments usa
       JOIN farm_areas fa ON fa.site_id = usa.site_id
       JOIN fields f ON f.farm_area_id = fa.id
       JOIN sites s ON s.id = fa.site_id
       WHERE usa.user_id = $1 AND f.id = $2 AND f.organization_id = $3`,
      [userId, fieldId, organizationId],
    );
    return siteResult.rows.length > 0;
  }

  // ============ Mappers ============
  
  private mapSiteAssignment(row: any): UserSiteAssignment {
    if (!row) return row;
    return {
      id: row.id,
      userId: row.user_id,
      siteId: row.site_id,
      assignedBy: row.assigned_by,
      createdAt: row.created_at,
      userName: row.user_name,
      userEmail: row.user_email,
      userRole: row.user_role,
      siteName: row.site_name,
    };
  }

  private mapZoneAssignment(row: any): UserZoneAssignment {
    return {
      id: row.id,
      userId: row.user_id,
      countryId: row.country_id,
      assignedBy: row.assigned_by,
      createdAt: row.created_at,
      countryName: row.country_name,
      countryCode: row.country_code,
    };
  }

  private mapFarmAreaAssignment(row: any): UserFarmAreaAssignment {
    if (!row) return row;
    return {
      id: row.id,
      userId: row.user_id,
      farmAreaId: row.farm_area_id,
      assignedBy: row.assigned_by,
      createdAt: row.created_at,
      userName: row.user_name,
      farmAreaName: row.farm_area_name,
      siteName: row.site_name,
    };
  }

  private mapFieldAssignment(row: any): UserFieldAssignment {
    if (!row) return row;
    return {
      id: row.id,
      userId: row.user_id,
      fieldId: row.field_id,
      assignedBy: row.assigned_by,
      createdAt: row.created_at,
      userName: row.user_name,
      fieldName: row.field_name,
      farmAreaName: row.farm_area_name,
    };
  }
}
