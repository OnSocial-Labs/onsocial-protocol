import type { Page } from '@playwright/test';

export const GUILD_PROPOSAL_ACTIVE_ROLE_ID = 'prop-role-active';
export const GUILD_PROPOSAL_ACTIVE_ROOM_ID = 'prop-room-active';
export const GUILD_PROPOSAL_EXPIRED_ID = 'prop-expired';
export const GUILD_PROPOSAL_RESOLVED_ID = 'prop-resolved';

const NOW_NS = Date.now() * 1_000_000;
const HOUR_NS = 3_600_000_000_000;
const DAY_NS = 24 * HOUR_NS;

const VOTING_CONFIG = {
  participation_quorum_bps: 5100,
  majority_threshold_bps: 5001,
  voting_period: '7d',
};

const PROPOSALS = [
  {
    id: GUILD_PROPOSAL_ACTIVE_ROLE_ID,
    sequence_number: 12,
    title: 'Change Permission for bob.testnet to level 2',
    type: 'permission_change',
    status: 'active',
    description: '',
    proposer: 'alice.testnet',
    target: 'bob.testnet',
    data: {
      PermissionChange: {
        target_user: 'bob.testnet',
        level: 2,
        reason: 'Keeps the rooms tidy',
      },
    },
    created_at: String(NOW_NS),
    voting_config: VOTING_CONFIG,
  },
  {
    id: GUILD_PROPOSAL_ACTIVE_ROOM_ID,
    sequence_number: 11,
    title: 'Grant Path Permission on groups/g/spaces/announcements/write to carol.testnet',
    type: 'path_permission_grant',
    status: 'active',
    description: '',
    proposer: 'alice.testnet',
    target: 'carol.testnet',
    data: {
      PathPermissionGrant: {
        target_user: 'carol.testnet',
        path: 'groups/g/spaces/announcements/write',
        reason: '',
      },
    },
    created_at: String(NOW_NS),
    voting_config: VOTING_CONFIG,
  },
  {
    id: GUILD_PROPOSAL_EXPIRED_ID,
    sequence_number: 10,
    title: 'Change Permission for dana.testnet to level 2',
    type: 'permission_change',
    status: 'active',
    description: '',
    proposer: 'alice.testnet',
    target: 'dana.testnet',
    data: {
      PermissionChange: { target_user: 'dana.testnet', level: 2 },
    },
    created_at: String(NOW_NS - 2 * HOUR_NS),
    voting_config: { ...VOTING_CONFIG, voting_period: '1h' },
  },
  {
    id: GUILD_PROPOSAL_RESOLVED_ID,
    sequence_number: 9,
    title: 'Change Permission for erin.testnet to level 3',
    type: 'permission_change',
    status: 'executed',
    description: '',
    proposer: 'alice.testnet',
    target: 'erin.testnet',
    data: {
      PermissionChange: { target_user: 'erin.testnet', level: 3 },
    },
    created_at: String(NOW_NS - 10 * DAY_NS),
    voting_config: VOTING_CONFIG,
  },
];

const TALLIES: Record<string, unknown> = {
  [GUILD_PROPOSAL_ACTIVE_ROLE_ID]: {
    yes_votes: 3,
    total_votes: 4,
    created_at: String(NOW_NS),
    locked_member_count: 7,
  },
  [GUILD_PROPOSAL_ACTIVE_ROOM_ID]: {
    yes_votes: 1,
    total_votes: 2,
    created_at: String(NOW_NS),
    locked_member_count: 7,
  },
  [GUILD_PROPOSAL_EXPIRED_ID]: {
    yes_votes: 1,
    total_votes: 2,
    created_at: String(NOW_NS - 2 * HOUR_NS),
    locked_member_count: 7,
  },
  [GUILD_PROPOSAL_RESOLVED_ID]: {
    yes_votes: 5,
    total_votes: 6,
    created_at: String(NOW_NS - 10 * DAY_NS),
    locked_member_count: 7,
  },
};

const PROFILE_ROWS = [
  { accountId: 'alice.testnet', name: 'Alice Admin' },
  { accountId: 'bob.testnet', name: 'Bob Builder' },
  { accountId: 'carol.testnet', name: 'Carol Creator' },
  { accountId: 'dana.testnet', name: 'Dana Dao' },
  { accountId: 'erin.testnet', name: 'Erin Engineer' },
];

/** Matches the active role card tally: 3 support + 1 oppose of 4 cast. */
const VOTE_ROWS: Record<string, unknown[]> = {
  [GUILD_PROPOSAL_ACTIVE_ROLE_ID]: [
    { voter: 'alice.testnet', approve: true, votedAt: 1 },
    { voter: 'bob.testnet', approve: true, votedAt: 2 },
    { voter: 'dana.testnet', approve: true, votedAt: 3 },
    { voter: 'erin.testnet', approve: false, votedAt: 4 },
  ],
  [GUILD_PROPOSAL_RESOLVED_ID]: [
    { voter: 'alice.testnet', approve: true, votedAt: 1 },
    { voter: 'bob.testnet', approve: true, votedAt: 2 },
  ],
};

function json(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

/**
 * Member-driven guild with proposal rows. Register after `stubGuildPage`
 * so these handlers win and `fallback` delegates the rest.
 */
export async function stubGuildProposals(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    if (raw.includes('ProfileStatsBatch')) {
      await route.fulfill(
        json({
          data: {
            profileSearch: PROFILE_ROWS.map((row) => ({
              accountId: row.accountId,
              name: row.name,
              avatar: null,
            })),
            profileKinds: [],
          },
        })
      );
      return;
    }
    if (raw.includes('query Votes(')) {
      const match = Object.entries(VOTE_ROWS).find(([proposalId]) =>
        raw.includes(proposalId)
      );
      await route.fulfill(
        json({ data: { groupUpdates: match ? match[1] : [] } })
      );
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/onapi/data/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/data/group-config')) {
      await route.fulfill(
        json({
          name: 'Audit Guild',
          description: 'A stub guild for e2e.',
          owner: 'owner.testnet',
          isPublic: true,
          memberDriven: true,
          topics: ['builders'],
        })
      );
      return;
    }
    if (path.endsWith('/data/proposals')) {
      await route.fulfill(json(PROPOSALS));
      return;
    }
    if (path.endsWith('/data/proposal-tally')) {
      const proposalId = url.searchParams.get('proposalId') ?? '';
      await route.fulfill(json(TALLIES[proposalId] ?? null));
      return;
    }
    if (path.endsWith('/data/vote')) {
      const proposalId = url.searchParams.get('proposalId') ?? '';
      await route.fulfill(
        json(
          proposalId === GUILD_PROPOSAL_ACTIVE_ROOM_ID ? { approve: true } : null
        )
      );
      return;
    }
    await route.fallback();
  });
}
