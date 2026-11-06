/**
 * Whether ActiveSiteContext has enough data to start season (and other) fetches.
 *
 * Org-default site fetch is only for users who are not already site-scoped.
 * Assigned sites skip that fetch, so they must not wait on orgDefaultLoaded.
 *
 * sitesSettled: the site list request has finished. When it finished with no
 * sites at all (a new organisation, or the list could not be loaded) there is
 * nothing more to wait for, so pages show their "no site" state instead of
 * loading forever.
 */
export function siteContextLoaded({
  orgDefaultLoaded,
  accessLoaded,
  allSites,
  assignedSiteIds,
  sitesSettled = false,
}) {
  if (!accessLoaded) return false;

  const hasSites = (allSites || []).length > 0;
  const assignedNone = Array.isArray(assignedSiteIds) && assignedSiteIds.length === 0;
  if (!hasSites && !assignedNone) return Boolean(sitesSettled && orgDefaultLoaded);

  const hasAssignedSites = Array.isArray(assignedSiteIds) && assignedSiteIds.length > 0;
  return Boolean(orgDefaultLoaded || hasAssignedSites);
}
