import type { OnSocial, ProfileSearchRow } from '@onsocial/sdk';

export const MENTION_SUGGEST_LIMIT = 10;
/** Outgoing standing pool to rank / filter against the typed query. */
const STANDING_MENTION_POOL = 40;

export type MentionPriorityAccount = {
  accountId: string;
  name?: string | null;
  avatar?: string | null;
};

function stubProfile(
  accountId: string,
  extras?: Pick<ProfileSearchRow, 'name' | 'avatar'>
): ProfileSearchRow {
  return {
    accountId,
    name: extras?.name ?? null,
    bio: null,
    avatar: extras?.avatar ?? null,
    banner: null,
    standingCount: 0,
    standingWithCount: 0,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    firstProfileTimestamp: null,
    lastProfileBlock: 0,
    lastProfileTimestamp: 0,
    lastActivityBlock: 0,
  };
}

function matchesMentionQuery(row: ProfileSearchRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (row.accountId.toLowerCase().includes(q)) return true;
  const name = row.name?.trim().toLowerCase();
  return Boolean(name && name.includes(q));
}

function orderStandingProfiles(
  standingIds: string[],
  profiles: ProfileSearchRow[]
): ProfileSearchRow[] {
  const byId = new Map(
    profiles.map((row) => [row.accountId.toLowerCase(), row] as const)
  );
  return standingIds.map(
    (id) => byId.get(id.toLowerCase()) ?? stubProfile(id)
  );
}

function priorityRows(
  priorityAccounts: MentionPriorityAccount[] | undefined,
  query: string,
  viewer: string | null
): ProfileSearchRow[] {
  if (!priorityAccounts?.length) return [];
  const seen = new Set<string>();
  const rows: ProfileSearchRow[] = [];
  for (const account of priorityAccounts) {
    const id = account.accountId.trim();
    const key = id.toLowerCase();
    if (!id || (viewer && key === viewer) || seen.has(key)) continue;
    const row = stubProfile(id, {
      name: account.name ?? null,
      avatar: account.avatar ?? null,
    });
    if (!matchesMentionQuery(row, query)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

/**
 * Mention picker rows for composer `@`:
 * 1. Context priorities (reply/quote author)
 * 2. People the viewer stands with
 * 3. Other search hits
 *
 * Caps at {@link MENTION_SUGGEST_LIMIT}. Excludes the viewer.
 */
export async function loadMentionSuggestions(
  client: OnSocial,
  query: string,
  viewerAccountId: string | null,
  priorityAccounts?: MentionPriorityAccount[]
): Promise<ProfileSearchRow[]> {
  const q = query.trim().toLowerCase();
  const viewer = viewerAccountId?.trim().toLowerCase() ?? null;
  const priorities = priorityRows(priorityAccounts, q, viewer);
  const priorityIds = new Set(
    priorities.map((row) => row.accountId.toLowerCase())
  );

  if (!viewer) {
    const rows = await client.query.profiles.search({
      ...(q ? { query: q } : {}),
      limit: MENTION_SUGGEST_LIMIT,
    });
    const rest = rows.filter(
      (row) => !priorityIds.has(row.accountId.toLowerCase())
    );
    return [...priorities, ...rest].slice(0, MENTION_SUGGEST_LIMIT);
  }

  const [searchRows, standingIds] = await Promise.all([
    client.query.profiles.search({
      ...(q ? { query: q } : {}),
      limit: MENTION_SUGGEST_LIMIT * 2,
    }),
    client.query.standings.outgoing(viewerAccountId!, {
      limit: STANDING_MENTION_POOL,
    }),
  ]);

  const standingProfiles = await client.query.profiles.statsForAccounts(
    standingIds
  );
  const orderedStanding = orderStandingProfiles(
    standingIds,
    standingProfiles
  ).filter((row) => {
    const id = row.accountId.toLowerCase();
    if (id === viewer || priorityIds.has(id)) return false;
    return matchesMentionQuery(row, q);
  });

  const seen = new Set([
    ...priorityIds,
    ...orderedStanding.map((row) => row.accountId.toLowerCase()),
  ]);
  const rest = searchRows.filter((row) => {
    const id = row.accountId.toLowerCase();
    if (id === viewer || seen.has(id)) return false;
    return matchesMentionQuery(row, q);
  });

  return [...priorities, ...orderedStanding, ...rest].slice(
    0,
    MENTION_SUGGEST_LIMIT
  );
}
