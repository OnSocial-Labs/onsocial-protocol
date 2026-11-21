import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { dedupeDropFanIds } from '@/lib/scarce-drop-love';

const PAGE_SIZE = 80;
const MAX_PAGES = 5;
const LOVE_KIND = 'love';
const SETTLED_MAX = 48;

const inflight = new Map<string, Promise<string[]>>();
const settled = new Map<string, string[]>();

function dropFanIdsCacheKey(creatorId: string, collectionId: string): string {
  return `${creatorId.trim()}\0${collectionId.trim()}`;
}

function rememberSettled(key: string, ids: string[]): void {
  settled.delete(key);
  settled.set(key, ids);
  while (settled.size > SETTLED_MAX) {
    const oldest = settled.keys().next().value;
    if (oldest == null) break;
    settled.delete(oldest);
  }
}

/** Track love or a love on the drop itself. The creator is not a fan. */
export function isDropListFanPath(collectionId: string, path: string): boolean {
  const id = collectionId.trim();
  const value = path.trim();
  if (!id || !value) return false;
  const content = `scarce/${id}`;
  if (
    value === content ||
    value === `${content}/` ||
    value.startsWith(`${content}/track/`)
  ) {
    return true;
  }
  const marker = `/${content}`;
  const at = value.lastIndexOf(marker);
  if (at < 0) return false;
  const after = value.slice(at + marker.length);
  return after === '' || after === '/' || after.startsWith('/track/');
}

/** First-seen fans for one drop. Blank ids, the creator, and other drops drop out. */
export function dropFanIdsFromReactions(
  rows: ReadonlyArray<{ accountId?: string | null; path?: string | null }>,
  collectionId: string,
  creatorId: string
): string[] {
  return dedupeDropFanIds(
    rows.filter((row) => isDropListFanPath(collectionId, row.path ?? '')),
    creatorId
  );
}

/** Sync hit from a prior warm / open — null when nothing settled yet. */
export function peekDropFanIds(
  creatorId: string,
  collectionId: string
): string[] | null {
  const hit = settled.get(dropFanIdsCacheKey(creatorId, collectionId));
  return hit ? [...hit] : null;
}

/** pointerdown warm — drop fans sheet opens with ids already in flight. */
export function warmDropFanIds(
  creatorId: string,
  collectionId: string
): void {
  void loadDropFanIds(creatorId, collectionId);
}

async function fetchDropFanIds(
  creatorId: string,
  collectionId: string
): Promise<string[]> {
  const owner = creatorId.trim();
  const id = collectionId.trim();
  if (!owner || !id) return [];
  const client = createReadOnlyOnSocialClient();
  const rows: Array<{ accountId?: string | null; path?: string | null }> = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await client.query.graphql<{
      reactionsCurrent: Array<{
        accountId?: string | null;
        path?: string | null;
      }>;
    }>({
      query: `
        query DropListFans($owner: String!, $like: String!, $kind: String!, $limit: Int!, $offset: Int!) {
          reactionsCurrent(
            where: {
              postOwner: { _eq: $owner }
              reactionKind: { _eq: $kind }
              operation: { _eq: "set" }
              path: { _like: $like }
            }
            orderBy: [{ blockHeight: DESC }]
            limit: $limit
            offset: $offset
          ) {
            accountId
            path
          }
        }
      `,
      variables: {
        owner,
        like: `%/scarce/${id}%`,
        kind: LOVE_KIND,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      },
    });
    const pageRows = res.data?.reactionsCurrent ?? [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }
  return dropFanIdsFromReactions(rows, id, owner);
}

/** People who loved this drop or one of its tracks. */
export async function loadDropFanIds(
  creatorId: string,
  collectionId: string
): Promise<string[]> {
  const key = dropFanIdsCacheKey(creatorId, collectionId);
  if (!creatorId.trim() || !collectionId.trim()) return [];
  const cached = settled.get(key);
  if (cached) return [...cached];
  const existing = inflight.get(key);
  if (existing) return existing.then((ids) => [...ids]);

  const promise = fetchDropFanIds(creatorId, collectionId)
    .then((ids) => {
      rememberSettled(key, ids);
      return ids;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise.then((ids) => [...ids]);
}

/** Test helper — drop warm + in-flight drop-fan id reads. */
export function clearDropFanIdsCache(): void {
  inflight.clear();
  settled.clear();
}
