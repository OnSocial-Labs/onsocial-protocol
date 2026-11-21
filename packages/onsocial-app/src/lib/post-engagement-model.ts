/** Shared engagement row shape — no React; safe for seed helpers + hook. */

export interface PostEngagement {
  replyCount: number;
  quoteCount: number;
  repostCount: number;
  reactionCount: number;
  viewerReacted: boolean;
  amplifyCount: number;
  viewerAmplified: boolean;
  /** Private bookmark — never a public count. */
  viewerSaved: boolean;
  viewerReposted: boolean;
  viewerRepostId: string | null;
  viewerRepostGroupId: string | null;
  /**
   * True once viewer like/save/amplify/repost colour is known (overlay or
   * soft-fill). Row seed and empty card fallback start false so a signed-in
   * tap cannot invert a grey heart that has not painted yet.
   */
  viewerFlagsReady: boolean;
  /**
   * True once `amplify_count` is known from the feed row or soft-fill.
   * Missing column must not paint as a settled zero.
   */
  amplifyCountReady: boolean;
  /** Bumps only when the viewer's own like confirms, so other cards stay still. */
  reactionRoll: number;
  /** Bumps when the viewer's save or unsave confirms on chain. */
  saveRoll: number;
  /** Bumps only when the viewer's own amplify confirms. */
  amplifyRoll: number;
  /** Bumps only when the viewer's own reply confirms. */
  replyRoll: number;
  /** Bumps when the viewer's repost, undo, or quote confirms. */
  shareRoll: number;
}

export type EngagementMap = Record<string, PostEngagement>;

/** Card / map miss — not viewer-ready until overlay or soft-fill paints. */
export const EMPTY_POST_ENGAGEMENT: PostEngagement = {
  replyCount: 0,
  quoteCount: 0,
  repostCount: 0,
  reactionCount: 0,
  viewerReacted: false,
  amplifyCount: 0,
  viewerAmplified: false,
  viewerSaved: false,
  viewerReposted: false,
  viewerRepostId: null,
  viewerRepostGroupId: null,
  viewerFlagsReady: false,
  amplifyCountReady: false,
  reactionRoll: 0,
  saveRoll: 0,
  amplifyRoll: 0,
  replyRoll: 0,
  shareRoll: 0,
};
