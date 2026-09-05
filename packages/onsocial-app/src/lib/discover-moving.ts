import type { PostRow, ProfileSearchRow } from '@onsocial/sdk';
import { formatDiscoverTabCount } from '@/lib/discover-tab-lead';

/** Any non-empty Moving peek — first paint can skip skeletons. */
export function isMovingLandingPainted(
  seed:
    | {
        movingTickers?: readonly unknown[] | null;
        movingTopics?: readonly unknown[] | null;
        places?: readonly unknown[] | null;
        profiles?: readonly unknown[] | null;
        hubs?: readonly unknown[] | null;
        posts?: readonly unknown[] | null;
        talkedAbout?: readonly unknown[] | null;
        dropsTraded?: readonly unknown[] | null;
        dropsLoved?: readonly unknown[] | null;
        proposals?: readonly unknown[] | null;
      }
    | null
    | undefined
): boolean {
  if (!seed) return false;
  return (
    (seed.movingTickers?.length ?? 0) > 0 ||
    (seed.movingTopics?.length ?? 0) > 0 ||
    (seed.places?.length ?? 0) > 0 ||
    (seed.profiles?.length ?? 0) > 0 ||
    (seed.hubs?.length ?? 0) > 0 ||
    (seed.posts?.length ?? 0) > 0 ||
    (seed.talkedAbout?.length ?? 0) > 0 ||
    (seed.dropsTraded?.length ?? 0) > 0 ||
    (seed.dropsLoved?.length ?? 0) > 0 ||
    (seed.proposals?.length ?? 0) > 0
  );
}

/** Empty SSR seed stays pending so Moving reserves skeletons instead of jumping in. */
export function movingSectionFromSeed<T>(
  rows: T[] | null | undefined,
  painted: boolean
): T[] | null {
  if (painted) return rows ?? [];
  if (Array.isArray(rows) && rows.length > 0) return rows;
  return null;
}

/** True when Home Hot would rank this post above a cold chrono fallback. */
export function postHasAmplifyHeat(
  post: Pick<PostRow, 'amplifyHeat'>
): boolean {
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

export type MovingPostRef = { author: string; postId: string };

export function movingPostRefKey(ref: MovingPostRef): string {
  return `${ref.author}\0${ref.postId}`;
}

/** Parent thread of a reply (`parentAuthor` + last `/post/{id}` in the path). */
export function parentPostRefFromReply(
  reply: Pick<PostRow, 'parentAuthor' | 'parentPath'>
): MovingPostRef | null {
  const path = reply.parentPath?.trim() ?? '';
  const marker = '/post/';
  const index = path.lastIndexOf(marker);
  const postId = index >= 0 ? path.slice(index + marker.length).trim() : '';
  const author =
    reply.parentAuthor?.trim() ||
    (index > 0 ? path.slice(0, index).split('/')[0]?.trim() : '');
  if (!author || !postId) return null;
  return { author, postId };
}

/**
 * Distinct parent threads in reply order — Moving Talked about is
 * what just got a reply, not lifetime comment counts.
 */
export function talkedAboutParentRefs(
  replies: Array<Pick<PostRow, 'parentAuthor' | 'parentPath'>>,
  limit = 6
): MovingPostRef[] {
  const seen = new Set<string>();
  const out: MovingPostRef[] = [];
  for (const reply of replies) {
    const ref = parentPostRefFromReply(reply);
    if (!ref) continue;
    const key = movingPostRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length >= limit) break;
  }
  return out;
}

export function orderPostsByRefs(
  rows: PostRow[],
  refs: MovingPostRef[]
): PostRow[] {
  const byKey = new Map(
    rows.map((row) => [movingPostRefKey(rowToRef(row)), row])
  );
  const out: PostRow[] = [];
  for (const ref of refs) {
    const row = byKey.get(movingPostRefKey(ref));
    if (row) out.push(row);
  }
  return out;
}

function rowToRef(row: PostRow): MovingPostRef {
  return { author: row.accountId, postId: row.postId };
}

/** Why-line on Hot posts — heat, not chrono. */
export function movingPostHeatLabel(): string {
  return 'Hot';
}

/** Why-line on Talked about — a reply just landed. */
export function movingPostTalkLabel(): string {
  return 'Talk';
}

/** Compact count on Moving chips and drop signals. */
export function movingChipCountLabel(count: number): string {
  return formatDiscoverTabCount(count);
}

/** Drop peek meta — sold vs fans, omitted when the rank has no number. */
export function movingScarceSignalLabel(
  kind: 'traded' | 'loved',
  count: number | null | undefined
): string | null {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  const compact = formatDiscoverTabCount(n);
  if (kind === 'loved') return n === 1 ? '1 fan' : `${compact} fans`;
  return n === 1 ? '1 sold' : `${compact} sold`;
}

/** Quiet proposal status — no chain jargon. */
export function movingProposalStatusLabel(
  status: string | null | undefined
): string | null {
  const raw = status?.trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (key === 'inprogress' || key === 'active' || key === 'open') {
    return 'In review';
  }
  if (key === 'approved' || key === 'accepted' || key === 'executed') {
    return 'Approved';
  }
  if (key === 'rejected' || key === 'failed') return 'Rejected';
  if (key === 'expired') return 'Expired';
  return raw;
}

/** Proposal peek meta — status first, type only when status is empty. */
export function movingProposalMeta(row: {
  status?: string | null;
  proposalType?: string | null;
  groupId?: string | null;
}): string {
  return (
    movingProposalStatusLabel(row.status) ||
    row.proposalType?.trim() ||
    row.groupId?.trim() ||
    ''
  );
}
