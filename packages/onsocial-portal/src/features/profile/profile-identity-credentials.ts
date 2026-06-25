import { ARCHIVED_GENESIS_SEASON_ID } from '@/lib/active-season';
import type { ProfileRallyParticipation } from '@/features/season/profile-rally-credentials';
import type { GovernanceDaoBoard } from '@/features/governance/governance-dao-board';
import {
  formatDaoRoleDisplayName,
  getDaoGroupMembershipRoleNames,
  GUARDIANS_ROLE_ID,
} from '@/features/governance/governance-proposal-builders';
import type { GovernanceDaoPolicy } from '@/features/governance/types';

export interface ProfileProtocolDestination {
  board: GovernanceDaoBoard;
  label: string;
  href: string;
}

export interface ProfileProtocolCredential {
  id: string;
  roleIds: string[];
  headerLabel: string;
  ariaLabel: string;
  destinations: ProfileProtocolDestination[];
}

export interface ProfileRallyCredentialGroup {
  participations: ProfileRallyParticipation[];
  featured: boolean;
  ariaLabel: string;
}

export interface ProfileCredentialsLayout {
  rally: ProfileRallyCredentialGroup | null;
  protocol: ProfileProtocolCredential | null;
}

const PROFILE_PROTOCOL_ROLE_ORDER = ['guardians', 'council'] as const;

const PROFILE_PROTOCOL_DESTINATIONS: ProfileProtocolDestination[] = [
  {
    board: 'governance',
    label: 'Governance',
    href: '/governance',
  },
  {
    board: 'treasury',
    label: 'Treasury',
    href: '/governance?dao=treasury',
  },
];

export function formatProfileRallyMenuTitle(
  participation: ProfileRallyParticipation
): string {
  if (participation.seasonId === ARCHIVED_GENESIS_SEASON_ID) {
    return participation.presentation.profileBadgeLabel || 'Genesis';
  }

  return (
    participation.presentation.pageTitle ||
    participation.presentation.profileBadgeLabel
  );
}

function sortRallyParticipations(
  participations: ProfileRallyParticipation[]
): ProfileRallyParticipation[] {
  return [...participations].sort((left, right) => {
    if (left.live !== right.live) {
      return left.live ? -1 : 1;
    }
    if (left.seasonId === ARCHIVED_GENESIS_SEASON_ID) return -1;
    if (right.seasonId === ARCHIVED_GENESIS_SEASON_ID) return 1;
    return formatProfileRallyMenuTitle(left).localeCompare(
      formatProfileRallyMenuTitle(right)
    );
  });
}

function sortProfileProtocolRoleIds(roleIds: string[]): string[] {
  return [...roleIds].sort((left, right) => {
    const leftRank = PROFILE_PROTOCOL_ROLE_ORDER.indexOf(
      left as (typeof PROFILE_PROTOCOL_ROLE_ORDER)[number]
    );
    const rightRank = PROFILE_PROTOCOL_ROLE_ORDER.indexOf(
      right as (typeof PROFILE_PROTOCOL_ROLE_ORDER)[number]
    );
    const leftOrder = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank;
    const rightOrder = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return formatDaoRoleDisplayName(left).localeCompare(
      formatDaoRoleDisplayName(right)
    );
  });
}

export function formatProfileProtocolRoleLabel(roleId: string): string {
  if (roleId.trim() === GUARDIANS_ROLE_ID) {
    return 'Protocol Guardian';
  }

  return formatDaoRoleDisplayName(roleId);
}

export function profileRallyCredentialsAriaLabel(
  participations: ProfileRallyParticipation[]
): string {
  if (participations.length === 0) return '';
  if (participations.length === 1) {
    const only = participations[0];
    return `${formatProfileRallyMenuTitle(only)} participant`;
  }
  const liveCount = participations.filter((item) => item.live).length;
  if (liveCount > 0) {
    return `Rally participant, ${participations.length} seasons`;
  }
  return `${participations.length} past rally seasons`;
}

export function buildProfileCredentialsLayout(input: {
  rallyParticipations: ProfileRallyParticipation[];
  protocol?: ProfileProtocolCredential | null;
}): ProfileCredentialsLayout {
  const sorted = sortRallyParticipations(input.rallyParticipations);
  const rally =
    sorted.length > 0
      ? {
          participations: sorted,
          featured: sorted.some((item) => item.live),
          ariaLabel: profileRallyCredentialsAriaLabel(sorted),
        }
      : null;

  return {
    rally,
    protocol: input.protocol ?? null,
  };
}

export function hasProfileCredentials(
  layout: ProfileCredentialsLayout
): boolean {
  return layout.rally != null || layout.protocol != null;
}

export function hasProfileCredentialsForParticipations(
  participations: ProfileRallyParticipation[],
  protocol?: ProfileProtocolCredential | null
): boolean {
  return hasProfileCredentials(
    buildProfileCredentialsLayout({
      rallyParticipations: participations,
      protocol,
    })
  );
}

export function resolveProfileProtocolRoleCredential(
  accountId: string | null,
  governancePolicy: GovernanceDaoPolicy | null,
  treasuryPolicy: GovernanceDaoPolicy | null
): ProfileProtocolCredential | null {
  if (!accountId) {
    return null;
  }

  const roleIds = sortProfileProtocolRoleIds([
    ...new Set([
      ...getDaoGroupMembershipRoleNames(governancePolicy, accountId),
      ...getDaoGroupMembershipRoleNames(treasuryPolicy, accountId),
    ]),
  ]);

  if (roleIds.length === 0) {
    return null;
  }

  const roleLabels = roleIds.map(formatProfileProtocolRoleLabel);
  const headerLabel = roleLabels.join(' · ');
  const ariaLabel =
    roleLabels.length === 1
      ? roleLabels[0]
      : `Protocol roles: ${roleLabels.join(', ')}`;

  return {
    id: 'protocol-dao-roles',
    roleIds,
    headerLabel,
    ariaLabel,
    destinations: PROFILE_PROTOCOL_DESTINATIONS,
  };
}
