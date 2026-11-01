import type { PostRow } from '@onsocial/sdk';

/**
 * Match SQL `post_amplify_heat`: raw heat below this is treated as 0 so
 * residual decay does not keep week-old amplifies above cold posts forever.
 */
export const AMPLIFY_HEAT_EPSILON = 0.01;

/** Effective Hot heat — floors tiny leftovers to 0 (same as SQL). */
export function effectiveAmplifyHeat(
  heat: number | null | undefined
): number {
  const value = heat ?? 0;
  if (!Number.isFinite(value) || value < AMPLIFY_HEAT_EPSILON) return 0;
  return value;
}

/** Hot feed order: amplifyHeat DESC (with epsilon), then blockHeight DESC. */
export function sortPostsByHot(posts: PostRow[]): PostRow[] {
  return [...posts].sort((left, right) => {
    const heatDelta =
      effectiveAmplifyHeat(right.amplifyHeat) -
      effectiveAmplifyHeat(left.amplifyHeat);
    if (heatDelta !== 0) return heatDelta;
    return (right.blockHeight ?? 0) - (left.blockHeight ?? 0);
  });
}
