import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { seedPostAuthorProfile } from '@/hooks/use-post-author-profiles';

/** Cap settled warm roster reads so fans sheets do not retain every open forever. */
const SETTLED_MAX = 32;

const inflight = new Map<string, Promise<ProfileListAccount[]>>();
const settled = new Map<string, ProfileListAccount[]>();

export function profileListAccountsCacheKey(
  accountIds: readonly string[],
  viewerAccountId: string | null
): string {
  const ids = [
    ...new Set(accountIds.map((id) => id.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const viewer = viewerAccountId?.trim() || '';
  return `${viewer}\0${ids.join('\n')}`;
}

function rememberSettled(key: string, accounts: ProfileListAccount[]): void {
  settled.delete(key);
  settled.set(key, accounts);
  while (settled.size > SETTLED_MAX) {
    const oldest = settled.keys().next().value;
    if (oldest == null) break;
    settled.delete(oldest);
  }
}

async function fetchProfileListAccounts(
  accountIds: readonly string[],
  viewerAccountId: string | null
): Promise<ProfileListAccount[]> {
  const ids = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const client = createReadOnlyOnSocialClient();
  const viewer = viewerAccountId?.trim() || '';
  const targets = viewer
    ? ids.filter((id) => !accountIdsEqual(id, viewer))
    : [];

  interface ViewerContext {
    viewerOutgoing: Array<{ targetAccount: string }>;
    viewerIncoming: Array<{ accountId: string }>;
    viewerEndorsements: Array<{ issuer: string }>;
    viewerOutgoingEndorsements: Array<{ target: string }>;
  }

  // Stats batch and viewer graph batch are independent — fire together.
  const [rows, viewerRes] = await Promise.all([
    client.query.profiles.statsForAccounts(ids),
    targets.length > 0
      ? client.query.graphql<ViewerContext>({
          query: `query FansRosterViewerContext($viewer: String!, $pageAccountIds: [String!]!) {
            viewerOutgoing: standingsCurrent(
              where: {
                accountId: {_eq: $viewer},
                targetAccount: {_in: $pageAccountIds}
              }
            ) { targetAccount }
            viewerIncoming: standingsCurrent(
              where: {
                targetAccount: {_eq: $viewer},
                accountId: {_in: $pageAccountIds}
              }
            ) { accountId }
            viewerEndorsements: endorsementsCurrent(
              where: {
                target: {_eq: $viewer},
                issuer: {_in: $pageAccountIds},
                operation: {_eq: "set"}
              }
            ) { issuer }
            viewerOutgoingEndorsements: endorsementsCurrent(
              where: {
                issuer: {_eq: $viewer},
                target: {_in: $pageAccountIds},
                operation: {_eq: "set"}
              }
            ) { target }
          }`,
          variables: { viewer, pageAccountIds: targets },
        })
      : Promise.resolve(null),
  ]);
  const byId = new Map(rows.map((row) => [row.accountId, row] as const));

  const viewerOutgoing = new Set(
    (viewerRes?.data?.viewerOutgoing ?? []).map((row) => row.targetAccount)
  );
  const viewerIncoming = new Set(
    (viewerRes?.data?.viewerIncoming ?? []).map((row) => row.accountId)
  );
  const endorsementIssuers = new Set(
    (viewerRes?.data?.viewerEndorsements ?? []).map((row) => row.issuer)
  );
  const endorsementTargets = new Set(
    (viewerRes?.data?.viewerOutgoingEndorsements ?? []).map((row) => row.target)
  );

  return ids.map((accountId) => {
    const row = byId.get(accountId);
    const name = row?.name?.trim() || null;
    const avatarUrl = resolveProfileMediaUrl(row?.avatar ?? null);
    if (name || avatarUrl) {
      seedPostAuthorProfile({
        accountId,
        displayName: name || accountId,
        avatarUrl,
        kind: row?.kind,
      });
    }
    return {
      accountId,
      name,
      bio: row?.bio ?? null,
      avatarUrl,
      standingCount: Number(row?.standingCount ?? 0) || 0,
      standingWithCount: Number(row?.standingWithCount ?? 0) || 0,
      mutualStandingCount: Number(row?.mutualStandingCount ?? 0) || 0,
      endorsementsReceivedCount:
        Number(row?.endorsementsReceivedCount ?? 0) || 0,
      endorsementsGivenCount: Number(row?.endorsementsGivenCount ?? 0) || 0,
      viewerStanding: viewerOutgoing.has(accountId),
      theyStandWithViewer: viewerIncoming.has(accountId),
      targetEndorsedViewer: endorsementIssuers.has(accountId),
      viewerEndorsed: endorsementTargets.has(accountId),
      rowHydrated: true,
      kind: row?.kind ?? null,
      reputation:
        typeof row?.reputation === 'number' && row.reputation > 0
          ? row.reputation
          : undefined,
    } satisfies ProfileListAccount;
  });
}

/** Sync hit from a prior warm / open — null when nothing settled yet. */
export function peekProfileListAccounts(
  accountIds: readonly string[],
  viewerAccountId: string | null
): ProfileListAccount[] | null {
  const key = profileListAccountsCacheKey(accountIds, viewerAccountId);
  const hit = settled.get(key);
  return hit ? hit.map((row) => ({ ...row })) : null;
}

/** pointerdown warm — fans / stands open with people already hydrated. */
export function warmProfileListAccounts(
  accountIds: readonly string[],
  viewerAccountId: string | null
): void {
  void loadProfileListAccounts(accountIds, viewerAccountId);
}

/**
 * Hydrate standing-style list rows for known account ids (one stats batch +
 * optional viewer graph batch). Same shape as Discover / standings lists.
 * Shares in-flight work and keeps a short settled warm cache.
 */
export async function loadProfileListAccounts(
  accountIds: readonly string[],
  viewerAccountId: string | null
): Promise<ProfileListAccount[]> {
  const key = profileListAccountsCacheKey(accountIds, viewerAccountId);
  const cached = settled.get(key);
  if (cached) return cached.map((row) => ({ ...row }));
  const existing = inflight.get(key);
  if (existing) return existing.then((rows) => rows.map((row) => ({ ...row })));

  const promise = fetchProfileListAccounts(accountIds, viewerAccountId)
    .then((accounts) => {
      rememberSettled(key, accounts);
      return accounts;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise.then((rows) => rows.map((row) => ({ ...row })));
}

/** Test helper — drop warm + in-flight profile roster reads. */
export function clearProfileListAccountsCache(): void {
  inflight.clear();
  settled.clear();
}
