/**
 * Home-feed load / append / reconcile gates — pure so races stay unit-tested
 * without mounting the page.
 */

/** Load-more must not start while a full load, soft refresh, or append is live. */
export function canStartHomeFeedAppend(input: {
  appendInFlight: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
}): boolean {
  return (
    !input.appendInFlight && !input.isLoading && !input.isRefreshing
  );
}

/** Head probe reconcile skips when a load owns the list. */
export function canRunHomeFeedReconcile(input: {
  isLoading: boolean;
  isRefreshing: boolean;
  postCount: number;
}): boolean {
  return (
    !input.isLoading && !input.isRefreshing && input.postCount > 0
  );
}
