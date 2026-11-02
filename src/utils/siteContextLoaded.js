/**
 * Whether ActiveSiteContext has enough data to start season (and other) fetches.
 *
 * Org-default site fetch is only for users who are not already site-scoped.
 * Assigned sites skip that fetch, so they must not wait on orgDefaultLoaded.
 */
export function siteContextLoaded({
  orgDefaultLoaded,
  accessLoaded,
  allSites,
  assignedSiteIds,
}) {
  if (!accessLoaded) return false;

  const hasSites = (allSites || []).length > 0;
  const assignedNone = Array.isArray(assignedSiteIds) && assignedSiteIds.length === 0;
  if (!hasSites && !assignedNone) return false;

  const hasAssignedSites = Array.isArray(assignedSiteIds) && assignedSiteIds.length > 0;
  return Boolean(orgDefaultLoaded || hasAssignedSites);
}
