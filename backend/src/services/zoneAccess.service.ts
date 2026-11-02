import { AssignmentRepository } from '../repositories/assignment.repository';
import { CountryRepository } from '../repositories/country.repository';
import { SiteRepository } from '../repositories/site.repository';
import { AppError, NotFoundError } from '../utils/errors';

/**
 * Who may change zones (countries) and sites.
 *
 * - CEO: every zone and site in their organization.
 * - Farm manager: rename the zones assigned to them, and create, rename and
 *   delete sites inside those zones. Nothing in any other zone.
 * - Everyone else: no writes (the routes reject them before this runs).
 *
 * Anything outside the caller's organization is reported as not found.
 */

const assignmentRepo = new AssignmentRepository();
const countryRepo = new CountryRepository();
const siteRepo = new SiteRepository();

type Actor = { userId: string; role: string };

async function assertZoneInOrg(countryId: string, orgId: string): Promise<void> {
  const zoneOrg = await countryRepo.getOrganizationId(countryId);
  if (!zoneOrg || zoneOrg !== orgId) {
    throw new NotFoundError('Zone not found');
  }
}

/** The caller may rename this zone and change the sites inside it. */
export async function assertCanManageZone(actor: Actor, countryId: string, orgId: string): Promise<void> {
  await assertZoneInOrg(countryId, orgId);
  if (actor.role === 'ceo') return;
  if (actor.role === 'farm_manager'
    && await assignmentRepo.isZoneAssignedToUser(actor.userId, actor.role, countryId, orgId)) {
    return;
  }
  throw new AppError('You can only change zones assigned to you', 'FORBIDDEN', 403);
}

/** The caller may rename or delete this site. Returns the site's zone id. */
export async function assertCanManageSite(actor: Actor, siteId: string, orgId: string): Promise<string> {
  const scope = await siteRepo.getScope(siteId);
  if (!scope || scope.organizationId !== orgId) {
    throw new NotFoundError('Site not found');
  }
  await assertCanManageZone(actor, scope.countryId, orgId);
  return scope.countryId;
}
