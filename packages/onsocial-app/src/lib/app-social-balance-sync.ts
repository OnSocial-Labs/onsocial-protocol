export interface AppSocialBalanceRefreshOptions {
  silent?: boolean;
  retry?: boolean;
}

type RefreshHandler = (
  options?: AppSocialBalanceRefreshOptions
) => Promise<void>;

let refreshHandler: RefreshHandler | null = null;

export function registerAppSocialBalanceRefresh(
  refresh: RefreshHandler
): () => void {
  refreshHandler = refresh;

  return () => {
    if (refreshHandler === refresh) {
      refreshHandler = null;
    }
  };
}

/** Refresh wallet balance from chain after a confirmed collect. */
export async function refreshAppSocialBalanceAfterClaim(): Promise<void> {
  await refreshHandler?.({ silent: true, retry: true });
}
