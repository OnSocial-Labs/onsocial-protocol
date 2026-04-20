const ACCOUNT_ROUTE_PREFIX = '@';

export function normalizeAccountRoute(segment: string): string | null {
  const decodedSegment = decodeURIComponent(segment).trim();

  if (!decodedSegment.startsWith(ACCOUNT_ROUTE_PREFIX)) {
    return null;
  }

  const accountId = decodedSegment.slice(1).trim();

  if (!accountId) {
    return null;
  }

  return accountId;
}
