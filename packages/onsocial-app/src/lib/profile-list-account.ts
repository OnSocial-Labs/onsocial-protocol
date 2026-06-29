import type { PageMoodId } from '@onsocial/sdk';
import type { DiscoverProfileSummary } from '@/lib/discover-profiles';
import { isStandingAccountDisplayReady } from '@/lib/profile-list-display';
import type { StandingAccountSummary } from '@/lib/profile-social-standings';

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
  moodId?: PageMoodId;
  standingSince?: number | null;
  standingBlockTimestamp?: number | null;
  /** False for ledger-injected rows until API enrichment lands. */
  rowHydrated?: boolean;
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
    moodId: account.moodId,
    standingSince: account.standingSince,
    standingBlockTimestamp: account.standingBlockTimestamp,
    rowHydrated: isStandingAccountDisplayReady(account),
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
    moodId: profile.moodId,
    standingSince: profile.standingSince,
    standingBlockTimestamp: profile.standingBlockTimestamp,
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
    moodId: account.moodId,
    standingSince: account.standingSince,
    standingBlockTimestamp: account.standingBlockTimestamp,
  };
}
