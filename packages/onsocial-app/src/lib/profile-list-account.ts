import type { PageMoodId, ProfileKind } from '@onsocial/sdk';
import type { DiscoverProfileSummary } from '@/lib/discover-profiles';
import { isStandingAccountDisplayReady } from '@/lib/profile-list-display';
import type { StandingAccountSummary } from '@/lib/profile-social-standings';

/** Roster search — name or account. A blank query keeps the full list. */
export function filterGuestRoster<
  T extends { accountId: string; name?: string | null },
>(accounts: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...accounts];
  return accounts.filter((account) => {
    const name = account.name?.trim().toLowerCase() ?? '';
    return account.accountId.toLowerCase().includes(q) || name.includes(q);
  });
}

export function positiveListReputation(
  value: number | null | undefined
): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** Neutral list row model for discover, standing, and future social lists. */
export interface ProfileListAccount {
  accountId: string;
  name: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  targetEndorsedViewer: boolean;
  viewerEndorsed: boolean;
  moodId?: PageMoodId;
  standingSince?: number | null;
  standingBlockTimestamp?: number | null;
  /** False for ledger-injected rows until API enrichment lands. */
  rowHydrated?: boolean;
  /** Server/client hint that this peer is a DAO org. */
  isDao?: boolean;
  kind?: ProfileKind | null;
  industry?: string | null;
  openJobsCount?: number;
  /** Standing services. Omitted until the directory count is known. */
  offerCount?: number;
  /** Portfolio reputation score. Omitted at zero. */
  reputation?: number;
}

export function standingAccountToProfileListAccount(
  account: StandingAccountSummary
): ProfileListAccount {
  return {
    accountId: account.accountId,
    name: account.name,
    bio: account.bio ?? null,
    avatarUrl: account.avatarUrl,
    standingCount: account.standingCount ?? 0,
    standingWithCount: account.standingWithCount ?? 0,
    mutualStandingCount: account.mutualStandingCount ?? 0,
    endorsementsReceivedCount: account.endorsementsReceivedCount ?? 0,
    endorsementsGivenCount: account.endorsementsGivenCount ?? 0,
    viewerStanding: Boolean(account.viewerStanding),
    theyStandWithViewer: Boolean(account.theyStandWithViewer),
    targetEndorsedViewer: Boolean(account.targetEndorsedViewer),
    viewerEndorsed: Boolean(account.viewerEndorsed),
    moodId: account.moodId,
    standingSince: account.standingSince,
    standingBlockTimestamp: account.standingBlockTimestamp,
    rowHydrated: isStandingAccountDisplayReady(account),
    isDao: account.isDao,
    kind: account.kind,
    reputation: positiveListReputation(account.reputation),
  };
}

export function discoverProfileToProfileListAccount(
  profile: DiscoverProfileSummary
): ProfileListAccount {
  return {
    accountId: profile.accountId,
    name: profile.name,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    standingCount: profile.standingCount,
    standingWithCount: profile.standingWithCount,
    mutualStandingCount: profile.mutualStandingCount,
    endorsementsReceivedCount: profile.endorsementsReceivedCount,
    endorsementsGivenCount: profile.endorsementsGivenCount,
    viewerStanding: profile.viewerStanding,
    theyStandWithViewer: profile.theyStandWithViewer,
    targetEndorsedViewer: profile.targetEndorsedViewer,
    viewerEndorsed: profile.viewerEndorsed,
    moodId: profile.moodId,
    standingSince: profile.standingSince,
    standingBlockTimestamp: profile.standingBlockTimestamp,
    kind: profile.kind,
    industry: profile.industry,
    openJobsCount: profile.openJobsCount,
    offerCount: profile.offerCount,
    reputation: positiveListReputation(profile.reputation),
  };
}

export function profileListAccountToStandingSummary(
  account: ProfileListAccount
): StandingAccountSummary {
  return {
    accountId: account.accountId,
    name: account.name,
    bio: account.bio ?? null,
    avatarUrl: account.avatarUrl,
    standingCount: account.standingCount,
    standingWithCount: account.standingWithCount,
    mutualStandingCount: account.mutualStandingCount,
    endorsementsReceivedCount: account.endorsementsReceivedCount,
    endorsementsGivenCount: account.endorsementsGivenCount,
    viewerStanding: account.viewerStanding,
    theyStandWithViewer: account.theyStandWithViewer,
    targetEndorsedViewer: account.targetEndorsedViewer,
    viewerEndorsed: account.viewerEndorsed,
    moodId: account.moodId,
    standingSince: account.standingSince,
    standingBlockTimestamp: account.standingBlockTimestamp,
    isDao: account.isDao,
    kind: account.kind,
    reputation: positiveListReputation(account.reputation),
  };
}
