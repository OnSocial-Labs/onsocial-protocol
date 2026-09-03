import type { PostRow, ProfileSearchRow } from '@onsocial/sdk';

/** True when Home Hot would rank this post above a cold chrono fallback. */
export function postHasAmplifyHeat(post: Pick<PostRow, 'amplifyHeat'>): boolean {
  return Number(post.amplifyHeat) > 0;
}

/** Keep only posts with real amplify heat. Cold / chrono fallback stays off Moving. */
export function selectHotPosts(items: PostRow[], limit = 6): PostRow[] {
  return items.filter(postHasAmplifyHeat).slice(0, limit);
}

/** Distinct authors in recency order — Moving Active is who just posted. */
export function recentPosterIds(items: PostRow[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of items) {
    const id = row.accountId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

export function orderRowsByAccountIds<T extends { accountId: string }>(
  rows: T[],
  ids: string[]
): T[] {
  const byId = new Map(rows.map((row) => [row.accountId, row]));
  const out: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}

export function orderProfileSearchByPosterIds(
  rows: ProfileSearchRow[],
  ids: string[]
): ProfileSearchRow[] {
  return orderRowsByAccountIds(rows, ids);
}
