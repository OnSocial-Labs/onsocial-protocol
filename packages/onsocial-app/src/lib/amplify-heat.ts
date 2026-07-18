import type { PostRow } from '@onsocial/sdk';
import { postKey } from '@/lib/post-display';

const SOCIAL_DECIMALS = 1e18;

/** Detail from a confirmed amplify spend (for optimistic Hot ranking). */
export interface AmplifySuccessDetail {
  amountYocto: bigint;
  isSelf: boolean;
  /** Viewer already amplified this post before this spend. */
  isRepeatFromViewer?: boolean;
}

/**
 * Optimistic heat delta matching SQL `post_amplify_heat` (age ≈ 0):
 * log2(1 + SOCIAL) · unique · self
 */
export function optimisticAmplifyHeatDelta(
  detail: AmplifySuccessDetail
): number {
  const social = Number(detail.amountYocto) / SOCIAL_DECIMALS;
  if (!Number.isFinite(social) || social <= 0) return 0;
  const logAmount = Math.log2(1 + social);
  const unique = detail.isRepeatFromViewer ? 0.25 : 1;
  const self = detail.isSelf ? 0.25 : 1;
  return logAmount * unique * self;
}

/** Hot feed order: amplifyHeat DESC, then blockHeight DESC. */
export function sortPostsByHot(posts: PostRow[]): PostRow[] {
  return [...posts].sort((left, right) => {
    const heatDelta = (right.amplifyHeat ?? 0) - (left.amplifyHeat ?? 0);
    if (heatDelta !== 0) return heatDelta;
    return (right.blockHeight ?? 0) - (left.blockHeight ?? 0);
  });
}

/** Apply optimistic heat to one post and re-sort for Hot. */
export function applyOptimisticAmplifyHeat(
  posts: PostRow[],
  post: PostRow,
  detail: AmplifySuccessDetail
): PostRow[] {
  const key = postKey(post);
  const delta = optimisticAmplifyHeatDelta(detail);
  if (delta <= 0) return sortPostsByHot(posts);

  const next = posts.map((row) => {
    if (postKey(row) !== key) return row;
    return {
      ...row,
      amplifyHeat: (row.amplifyHeat ?? 0) + delta,
    };
  });
  return sortPostsByHot(next);
}

/** Keep optimistic heat floors until indexer catches up (or TTL elapses). */
export type AmplifyHeatFloor = {
  heat: number;
  untilMs: number;
};

export function mergeAmplifyHeatFloors(
  posts: PostRow[],
  floors: ReadonlyMap<string, AmplifyHeatFloor>,
  nowMs: number = Date.now()
): PostRow[] {
  if (floors.size === 0) return posts;
  let changed = false;
  const next = posts.map((row) => {
    const floor = floors.get(postKey(row));
    if (!floor || floor.untilMs <= nowMs) return row;
    const current = row.amplifyHeat ?? 0;
    if (current >= floor.heat) return row;
    changed = true;
    return { ...row, amplifyHeat: floor.heat };
  });
  return changed ? sortPostsByHot(next) : posts;
}
