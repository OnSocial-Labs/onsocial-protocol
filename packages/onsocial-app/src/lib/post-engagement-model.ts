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
  /** Bumps only when the viewer's own like confirms, so other cards stay still. */
  reactionRoll: number;
  /** Bumps only when the viewer's own amplify confirms. */
  amplifyRoll: number;
  /** Bumps only when the viewer's own reply confirms. */
  replyRoll: number;
  /** Bumps when the viewer's repost, undo, or quote confirms. */
  shareRoll: number;
}

export type EngagementMap = Record<string, PostEngagement>;

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
  reactionRoll: 0,
  amplifyRoll: 0,
  replyRoll: 0,
  shareRoll: 0,
};
