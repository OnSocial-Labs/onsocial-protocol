// ---------------------------------------------------------------------------
// OnSocial SDK — reactions module
//
// The single, blessed entry point for reacting to posts. Wraps the lower-
// level builders in `social.ts` so app devs have one obvious name to reach
// for, plus the two helpers every feed UI needs:
//
//   await os.reactions.add(post, 'like')
//   await os.reactions.remove(post, 'like')
//   await os.reactions.toggle(post, 'like', { viewer: 'alice.near' })
//   const summary = await os.reactions.summary(post, { viewer: 'alice.near' })
//   //   → { counts: { like: 42, fire: 17, total: 59 },
//   //       viewerReacted: ['like'] }
//
// `kind` accepts the controlled `ReactionKind` set or any custom string
// (matching the contract / ReactionV1 escape hatch).
// ---------------------------------------------------------------------------

import type { SocialModule } from './social.js';
import type { QueryModule } from './query.js';
import type { PostRef, RelayResponse } from './types.js';
import type { ReactionKind } from './schema/v1.js';

export type ReactionInput = ReactionKind | (string & {});

export interface ReactionTarget {
  author: string;
  postId: string;
}

export interface ToggleOptions {
  /** Account ID of the viewer (required to read existing reaction state). */
  viewer: string;
  /** Optional custom emoji passthrough when `kind` is a freeform string. */
  emoji?: string;
}

export interface ReactionSummary {
  /** Map of kind → count. Includes a `total` key. */
  counts: Record<string, number>;
  /** Reaction kinds the viewer has currently set. Empty if no viewer given. */
  viewerReacted: string[];
}

function toRef(target: ReactionTarget | PostRef): PostRef {
  return { author: target.author, postId: target.postId };
}

export class ReactionsModule {
  constructor(
    private _social: SocialModule,
    private _query: QueryModule
  ) {}

  /**
   * Add a reaction. Idempotent on the contract side — re-adding the same
   * `kind` overwrites the previous value.
   *
   * ```ts
   * await os.reactions.add(post, 'like');
   * await os.reactions.add(post, '🔥', { emoji: '🔥' });
   * ```
   */
  add(
    post: ReactionTarget | PostRef,
    kind: ReactionInput,
    extra?: { emoji?: string }
  ): Promise<RelayResponse> {
    return this._social.reactToPost(toRef(post), {
      type: kind,
      ...(extra?.emoji ? { emoji: extra.emoji } : {}),
    });
  }

  /** Remove a previously-set reaction by kind. */
  remove(
    post: ReactionTarget | PostRef,
    kind: ReactionInput
  ): Promise<RelayResponse> {
    return this._social.unreactFromPost(toRef(post), kind);
  }

  /**
   * Toggle a reaction: read the viewer's current state and either add or
   * remove. Returns the relay response from whichever write was performed,
   * plus the resulting `applied` state for UI updates.
   *
   * ```ts
   * const { applied } = await os.reactions.toggle(post, 'like', {
   *   viewer: 'alice.near',
   * });
   * setLiked(applied);
   * ```
   */
  async toggle(
    post: ReactionTarget | PostRef,
    kind: ReactionInput,
    opts: ToggleOptions
  ): Promise<{ response: RelayResponse; applied: boolean }> {
    const summary = await this.summary(post, { viewer: opts.viewer });
    const isSet = summary.viewerReacted.includes(kind);
    if (isSet) {
      const response = await this.remove(post, kind);
      return { response, applied: false };
    }
    const response = await this.add(post, kind, { emoji: opts.emoji });
    return { response, applied: true };
  }

  /**
   * One-call reaction summary for a post. Combines the indexed reaction
   * counts with the viewer's per-kind state when `opts.viewer` is given.
   *
   * ```ts
   * const { counts, viewerReacted } = await os.reactions.summary(post, {
   *   viewer: 'alice.near',
   * });
   * ```
   */
  async summary(
    post: ReactionTarget | PostRef,
    opts: { viewer?: string } = {}
  ): Promise<ReactionSummary> {
    const ref = toRef(post);
    const path = `post/${ref.postId}`;

    if (!opts.viewer) {
      const counts = await this._query.getReactionCounts(ref.author, path);
      return { counts, viewerReacted: [] };
    }

    const [counts, viewerReacted] = await Promise.all([
      this._query.getReactionCounts(ref.author, path),
      this._viewerKinds(opts.viewer, ref.author, ref.postId),
    ]);
    return { counts, viewerReacted };
  }

  private async _viewerKinds(
    viewer: string,
    postOwner: string,
    postId: string
  ): Promise<string[]> {
    const res = await this._query.graphql<{
      reactionsCurrent: Array<{
        reactionKind: string;
        operation: string;
      }>;
    }>({
      query: `query ViewerReactions($viewer: String!, $owner: String!, $like: String!) {
        reactionsCurrent(where: {
          accountId: {_eq: $viewer},
          postOwner: {_eq: $owner},
          path: {_like: $like},
          operation: {_eq: "set"}
        }) {
          reactionKind operation
        }
      }`,
      variables: {
        viewer,
        owner: postOwner,
        like: `%/post/${postId}`,
      },
    });
    return (res.data?.reactionsCurrent ?? []).map((r) => r.reactionKind);
  }
}
