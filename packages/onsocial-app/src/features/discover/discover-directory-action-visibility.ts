/** Which directory verbs a discover account row may show. */
export function discoverDirectoryActionVisibility(account: {
  offerCount?: number;
  openJobsCount?: number;
}): { offers: boolean; hiring: boolean } {
  return {
    offers: (account.offerCount ?? 0) > 0,
    hiring: (account.openJobsCount ?? 0) > 0,
  };
}
