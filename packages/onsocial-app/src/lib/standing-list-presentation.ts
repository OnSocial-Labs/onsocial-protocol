export function standingListShowsSkeleton(input: {
  listPreview: boolean;
  searching: boolean;
  relationshipSynced: boolean;
  walletLoading: boolean;
  viewerKnown: boolean;
  hasRows: boolean;
  listBootstrapReady: boolean;
  isLoading: boolean;
}): boolean {
  if (input.listPreview) return true;

  // Viewer lines ("Stands with you", "Endorsed you") sit above the name.
  // Hold the skeleton until they are known so the row is not pushed down.
  const holdForViewerLines =
    !input.searching &&
    !input.relationshipSynced &&
    (input.walletLoading || input.viewerKnown);
  if (holdForViewerLines) return true;

  return (
    !input.hasRows &&
    !input.searching &&
    (input.walletLoading ||
      (!input.listBootstrapReady && input.isLoading) ||
      (!input.listBootstrapReady && !input.relationshipSynced))
  );
}

export type StandingListLoadPlan =
  | 'cache-refresh'
  | 'viewer-lines'
  | 'signed-out-ready'
  | 'full-page';

/**
 * First screen that already has people: join viewer lines, or show the
 * signed-out page as-is. A new page (search, another tab, no seed) is a
 * full read. A cache that already includes this viewer refreshes in the
 * background.
 */
export function standingListLoadPlan(input: {
  cacheReady: boolean;
  canUseInitialList: boolean;
  viewerKnown: boolean;
}): StandingListLoadPlan {
  if (input.cacheReady) return 'cache-refresh';
  if (input.canUseInitialList && input.viewerKnown) return 'viewer-lines';
  if (input.canUseInitialList) return 'signed-out-ready';
  return 'full-page';
}
