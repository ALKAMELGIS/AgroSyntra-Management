import { dbPool } from '../db/client';

export interface CostEntry {
  id: string;
  field_id: string;
  category: string;
  amount: number;
  currency: string;
  description: string;
  date: string;
  created_by: string;
}

export async function listCosts(filters: {
  organizationId: string;
  field_id?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
  created_by?: string;
}): Promise<{ costs: CostEntry[]; total: number }> {
  const conditions: string[] = ['f.organization_id = $1'];
  const params: any[] = [filters.organizationId];
  let idx = 2;

  if (filters.field_id) {
    conditions.push(`ce.field_id = $${idx++}`);
    params.push(filters.field_id);
  }
  if (filters.category) {
    conditions.push(`ce.category = $${idx++}`);
    params.push(filters.category);
  }
  if (filters.start_date) {
    conditions.push(`ce.date >= $${idx++}`);
    params.push(filters.start_date);
  }
  if (filters.end_date) {
    conditions.push(`ce.date <= $${idx++}`);
    params.push(filters.end_date);
  }
  if (filters.created_by) {
    conditions.push(`ce.created_by = $${idx++}`);
    params.push(filters.created_by);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const countResult = await dbPool.query(
    `SELECT COUNT(*) FROM cost_entries ce JOIN fields f ON f.id = ce.field_id ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await dbPool.query(
    `SELECT ce.*, f.name as field_name, u.name as created_by_name
     FROM cost_entries ce
     JOIN fields f ON f.id = ce.field_id
     LEFT JOIN users u ON u.id = ce.created_by
     ${where}
     ORDER BY ce.date DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return { costs: result.rows, total };
}

export async function createCost(data: Partial<CostEntry>): Promise<CostEntry> {
  const result = await dbPool.query(
    `INSERT INTO cost_entries (field_id, category, amount, currency, description, date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [data.field_id, data.category, data.amount, data.currency || 'AED', data.description, data.date, data.created_by]
  );
  return result.rows[0];
}

export async function updateCost(id: string, data: Partial<CostEntry>): Promise<CostEntry> {
  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (data.category) { fields.push(`category = $${idx++}`); params.push(data.category); }
  if (data.amount !== undefined) { fields.push(`amount = $${idx++}`); params.push(data.amount); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
  if (data.date) { fields.push(`date = $${idx++}`); params.push(data.date); }
  if (data.field_id) { fields.push(`field_id = $${idx++}`); params.push(data.field_id); }
  fields.push(`updated_at = NOW()`);

  params.push(id);
  const result = await dbPool.query(
    `UPDATE cost_entries SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0];
}

export async function deleteCost(id: string): Promise<void> {
  await dbPool.query('DELETE FROM cost_entries WHERE id = $1', [id]);
}

export async function getCostSummary(filters: {
  organizationId: string;
  field_id?: string;
  start_date?: string;
  end_date?: string;
}): Promise<any> {
  const conditions: string[] = ['f.organization_id = $1'];
  const params: any[] = [filters.organizationId];
  let idx = 2;

  if (filters.field_id) { conditions.push(`ce.field_id = $${idx++}`); params.push(filters.field_id); }
  if (filters.start_date) { conditions.push(`ce.date >= $${idx++}`); params.push(filters.start_date); }
  if (filters.end_date) { conditions.push(`ce.date <= $${idx++}`); params.push(filters.end_date); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const joinFields = 'JOIN fields f ON f.id = ce.field_id';

  // By category
  const byCategoryResult = await dbPool.query(
    `SELECT category, SUM(amount) as total, COUNT(*) as count
     FROM cost_entries ce ${joinFields} ${where}
     GROUP BY category ORDER BY total DESC`,
    params
  );

  // By field
  const byFieldResult = await dbPool.query(
    `SELECT ce.field_id, f.name as field_name, SUM(amount) as total
     FROM cost_entries ce
     ${joinFields}
     ${where}
     GROUP BY ce.field_id, f.name ORDER BY total DESC`,
    params
  );

  // Monthly trend
  const monthlyResult = await dbPool.query(
    `SELECT date_trunc('month', ce.date) as month, SUM(amount) as total
     FROM cost_entries ce ${joinFields} ${where}
     GROUP BY month ORDER BY month`,
    params
  );

  // Total
  const totalResult = await dbPool.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM cost_entries ce ${joinFields} ${where}`,
    params
  );

  return {
    byCategory: byCategoryResult.rows,
    byField: byFieldResult.rows,
    monthly: monthlyResult.rows,
    total: parseFloat(totalResult.rows[0].total),
  };
}
