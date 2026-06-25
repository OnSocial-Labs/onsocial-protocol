import { describe, expect, it } from 'vitest';
import {
  buildProfileCredentialsLayout,
  formatProfileProtocolRoleLabel,
  hasProfileCredentials,
  profileRallyCredentialsAriaLabel,
  resolveProfileProtocolRoleCredential,
} from '@/features/profile/profile-identity-credentials';
import type { ProfileRallyParticipation } from '@/features/season/profile-rally-credentials';
import { getSeasonPresentation } from '@/lib/active-season';
import type { GovernanceDaoPolicy } from '@/features/governance/types';

function participation(
  seasonId: string,
  live: boolean,
  rank = 42
): ProfileRallyParticipation {
  return {
    seasonId,
    presentation: getSeasonPresentation(seasonId),
    rank,
    live,
  };
}

describe('buildProfileCredentialsLayout', () => {
  it('groups all rally seasons under one credential', () => {
    const layout = buildProfileCredentialsLayout({
      rallyParticipations: [
        participation('season-one', true),
        participation('season-zero', false),
        participation('season-two', false, 9),
      ],
    });

    expect(layout.rally?.participations.map((item) => item.seasonId)).toEqual([
      'season-one',
      'season-zero',
      'season-two',
    ]);
    expect(layout.rally?.featured).toBe(true);
    expect(layout.protocol).toBeNull();
  });

  it('marks rally as archive tone when no live season', () => {
    const layout = buildProfileCredentialsLayout({
      rallyParticipations: [participation('season-zero', false)],
    });

    expect(layout.rally?.featured).toBe(false);
    expect(layout.rally?.participations).toHaveLength(1);
  });

  it('includes protocol roles when provided', () => {
    const layout = buildProfileCredentialsLayout({
      rallyParticipations: [],
      protocol: {
        id: 'protocol-dao-roles',
        roleIds: ['guardians'],
        headerLabel: 'Protocol Guardian',
        ariaLabel: 'Protocol Guardian',
        destinations: [
          { board: 'governance', label: 'Governance', href: '/governance' },
          {
            board: 'treasury',
            label: 'Treasury',
            href: '/governance?dao=treasury',
          },
        ],
      },
    });

    expect(hasProfileCredentials(layout)).toBe(true);
    expect(layout.protocol?.destinations).toHaveLength(2);
  });
});

describe('profileRallyCredentialsAriaLabel', () => {
  it('formats single and multi-season labels', () => {
    expect(
      profileRallyCredentialsAriaLabel([participation('season-one', true)])
    ).toBe('OnSocial Rally participant');
    expect(
      profileRallyCredentialsAriaLabel([
        participation('season-one', true),
        participation('season-zero', false),
      ])
    ).toBe('Rally participant, 2 seasons');
    expect(
      profileRallyCredentialsAriaLabel([
        participation('season-two', false),
        participation('season-three', false),
      ])
    ).toBe('2 past rally seasons');
  });
});

describe('formatProfileProtocolRoleLabel', () => {
  it('uses profile-specific guardian copy', () => {
    expect(formatProfileProtocolRoleLabel('guardians')).toBe(
      'Protocol Guardian'
    );
    expect(formatProfileProtocolRoleLabel('council')).toBe('Council');
  });
});

describe('resolveProfileProtocolRoleCredential', () => {
  const governancePolicy: GovernanceDaoPolicy = {
    roles: [
      {
        name: 'guardians',
        kind: { Group: ['alice.testnet', 'bob.testnet'] },
      },
      {
        name: 'council',
        kind: { Group: ['carol.testnet'] },
      },
    ],
  };

  const treasuryPolicy: GovernanceDaoPolicy = {
    roles: [
      {
        name: 'council',
        kind: { Group: ['dave.testnet'] },
      },
    ],
  };

  it('returns protocol credential with role header and DAO destinations', () => {
    const credential = resolveProfileProtocolRoleCredential(
      'alice.testnet',
      governancePolicy,
      treasuryPolicy
    );

    expect(credential?.headerLabel).toBe('Protocol Guardian');
    expect(credential?.destinations.map((item) => item.label)).toEqual([
      'Governance',
      'Treasury',
    ]);
    expect(credential?.destinations[1]?.href).toBe('/governance?dao=treasury');
  });

  it('merges roles from governance and treasury DAOs', () => {
    const credential = resolveProfileProtocolRoleCredential(
      'carol.testnet',
      governancePolicy,
      treasuryPolicy
    );

    expect(credential?.headerLabel).toBe('Council');
  });

  it('includes treasury-only membership', () => {
    const credential = resolveProfileProtocolRoleCredential(
      'dave.testnet',
      governancePolicy,
      treasuryPolicy
    );

    expect(credential?.headerLabel).toBe('Council');
  });

  it('returns null when account has no group roles', () => {
    expect(
      resolveProfileProtocolRoleCredential(
        'eve.testnet',
        governancePolicy,
        treasuryPolicy
      )
    ).toBeNull();
  });

  it('combines multiple roles in header order', () => {
    const credential = resolveProfileProtocolRoleCredential(
      'bob.testnet',
      {
        roles: [
          {
            name: 'guardians',
            kind: { Group: ['bob.testnet'] },
          },
          {
            name: 'council',
            kind: { Group: ['bob.testnet'] },
          },
        ],
      },
      null
    );

    expect(credential?.headerLabel).toBe('Protocol Guardian · Council');
  });
});
