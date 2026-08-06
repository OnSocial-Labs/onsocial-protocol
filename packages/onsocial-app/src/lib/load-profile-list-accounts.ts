import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { seedPostAuthorProfile } from '@/hooks/use-post-author-profiles';

/**
 * Hydrate standing-style list rows for known account ids (one stats batch +
 * optional viewer graph batch). Same shape as Discover / standings lists.
 */
export async function loadProfileListAccounts(
  accountIds: readonly string[],
  viewerAccountId: string | null
): Promise<ProfileListAccount[]> {
  const ids = [
    ...new Set(accountIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (ids.length === 0) return [];

  const client = createReadOnlyOnSocialClient();
  const rows = await client.query.profiles.statsForAccounts(ids);
  const byId = new Map(rows.map((row) => [row.accountId, row] as const));

  let viewerOutgoing = new Set<string>();
  let viewerIncoming = new Set<string>();
  let endorsementIssuers = new Set<string>();
  const viewer = viewerAccountId?.trim() || '';
  if (viewer) {
    const targets = ids.filter((id) => !accountIdsEqual(id, viewer));
    if (targets.length > 0) {
      const res = await client.query.graphql<{
        viewerOutgoing: Array<{ targetAccount: string }>;
        viewerIncoming: Array<{ accountId: string }>;
        viewerEndorsements: Array<{ issuer: string }>;
      }>({
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
        }`,
        variables: { viewer, pageAccountIds: targets },
      });
      viewerOutgoing = new Set(
        (res.data?.viewerOutgoing ?? []).map((row) => row.targetAccount)
      );
      viewerIncoming = new Set(
        (res.data?.viewerIncoming ?? []).map((row) => row.accountId)
      );
      endorsementIssuers = new Set(
        (res.data?.viewerEndorsements ?? []).map((row) => row.issuer)
      );
    }
  }

  return ids.map((accountId) => {
    const row = byId.get(accountId);
    const name = row?.name?.trim() || null;
    const avatarUrl = resolveProfileMediaUrl(row?.avatar ?? null);
    if (name || avatarUrl) {
      seedPostAuthorProfile({
        accountId,
        displayName: name || accountId,
        avatarUrl,
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
      rowHydrated: true,
    } satisfies ProfileListAccount;
  });
}
