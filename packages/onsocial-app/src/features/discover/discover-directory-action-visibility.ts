/** One verb for the face you are on, and only when that count is above zero. */
export function discoverDirectoryActionVisibility(
  account: {
    offerCount?: number;
    openJobsCount?: number;
  },
  face: 'offers' | 'hiring'
): { offers: boolean; hiring: boolean } {
  return {
    offers: face === 'offers' && (account.offerCount ?? 0) > 0,
    hiring: face === 'hiring' && (account.openJobsCount ?? 0) > 0,
  };
}
