import type { ProfileListAccount } from '@/lib/profile-list-account';
import type { DiscoverProfileSummary } from '@/lib/discover-profiles';
import type { DiscoverListCacheEntry } from '@/lib/discover-list-cache';
import type { StandingAccountSummary } from '@/lib/profile-social-standings';
import type { StandingListCacheEntry } from '@/lib/standing-list-cache';

const REQUIRED_STANDING_STATS = [
  'standingCount',
  'standingWithCount',
  'mutualStandingCount',
  'endorsementsReceivedCount',
  'endorsementsGivenCount',
] as const satisfies ReadonlyArray<keyof StandingAccountSummary>;

export function isStandingAccountDisplayReady(
  account: StandingAccountSummary
): boolean {
  return REQUIRED_STANDING_STATS.every((key) => account[key] != null);
}

export function isProfileListAccountDisplayReady(
  account: ProfileListAccount
): boolean {
  return account.rowHydrated !== false;
}

export function isStandingListCacheDisplayReady(
  entry: StandingListCacheEntry,
  viewerAccountId: string | null
): boolean {
  if (entry.viewerAccountId !== viewerAccountId) {
    return false;
  }

  return entry.accounts.every(isStandingAccountDisplayReady);
}

export function isDiscoverProfileDisplayReady(
  profile: DiscoverProfileSummary
): boolean {
  return (
    Boolean(profile.accountId) &&
    profile.standingCount != null &&
    profile.standingWithCount != null &&
    profile.mutualStandingCount != null &&
    profile.endorsementsReceivedCount != null &&
    profile.endorsementsGivenCount != null
  );
}

export function isDiscoverListCacheDisplayReady(
  entry: DiscoverListCacheEntry,
  viewerAccountId: string | null
): boolean {
  if (entry.viewerAccountId !== viewerAccountId) {
    return false;
  }

  return entry.profiles.every(isDiscoverProfileDisplayReady);
}
