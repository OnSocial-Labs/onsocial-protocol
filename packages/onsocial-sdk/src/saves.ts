// ---------------------------------------------------------------------------
// OnSocial SDK — saves module
//
// The single, blessed entry point for bookmarking content. Wraps
// `os.social.save` / `unsave` / `getSave` so app devs have one obvious
// name to reach for, plus accepts post objects directly instead of
// requiring callers to assemble `<owner>/post/<id>` content paths by hand:
//
//   await os.saves.add(post)
//   await os.saves.add(postRow, { folder: 'inspiration', note: '...' })
//   await os.saves.remove(post)
//   const { applied } = await os.saves.toggle(post)
//   const list = await os.saves.list({ viewer: 'alice.near' })
//   const has = await os.saves.has(post)            // viewer = JWT identity
//
// Saves are private to the saver — the SDK writes under the JWT identity,
// and reads default to that identity unless an explicit `viewer` is given.
// ---------------------------------------------------------------------------

import type { SocialModule } from './social.js';
import type { QueryModule } from './query.js';
import type { PostRef, RelayResponse, SaveRecord } from './types.js';
import type { PostRow } from './query.js';
import type { SaveBuildInput } from './social.js';

/**
 * Anything that identifies a post. Accepts:
 *   • A `PostRef` (`{ author, postId }`)
 *   • A materialised `PostRow` from `os.query`
 *   • A pre-built content path string (e.g. `'alice.near/post/123'`)
 */
export type SaveTarget = PostRef | PostRow | string;

function toContentPath(target: SaveTarget): string {
  if (typeof target === 'string') return target;
  if ('postId' in target && 'accountId' in target) {
    return `${target.accountId}/post/${target.postId}`;
  }
  if ('postId' in target && 'author' in target) {
    return `${target.author}/post/${target.postId}`;
  }
  throw new Error('saves: target must be a PostRef, PostRow, or content path');
}

export class SavesModule {
  constructor(
    private _social: SocialModule,
    private _query: QueryModule
  ) {}

  /**
   * Save / bookmark content. Idempotent — re-saving overwrites the
   * previous record (use this to update `folder` / `note`).
   *
   * ```ts
   * await os.saves.add(post);
   * await os.saves.add(postRow, { folder: 'inspiration', note: 'reread' });
   * ```
   */
  add(target: SaveTarget, input?: SaveBuildInput): Promise<RelayResponse> {
    return this._social.save(toContentPath(target), input);
  }

  /** Remove a saved bookmark. */
  remove(target: SaveTarget): Promise<RelayResponse> {
    return this._social.unsave(toContentPath(target));
  }

  /**
   * Read the current viewer's save record for a target, or `null` if not
   * saved. `viewer` defaults to the JWT identity (i.e. `os.social.getSave`
   * returns the caller's saves).
   */
  get(
    target: SaveTarget,
    opts: { viewer?: string } = {}
  ): Promise<SaveRecord | null> {
    return this._social.getSave(toContentPath(target), opts.viewer);
  }

  /** True if the viewer has a save record for `target`. */
  async has(
    target: SaveTarget,
    opts: { viewer?: string } = {}
  ): Promise<boolean> {
    const rec = await this.get(target, opts);
    return rec !== null;
  }

  /**
   * Toggle a save: read the viewer's current state and either add or
   * remove. Returns the relay response from whichever write was
   * performed plus the resulting `applied` state for UI updates.
   *
   * The viewer must be the same account as the JWT identity (saves are
   * always written under the caller); this helper just reads the
   * existing state to decide the direction.
   *
   * ```ts
   * const { applied } = await os.saves.toggle(post, {
   *   viewer: 'alice.near',
   *   input: { folder: 'inspiration' },
   * });
   * setBookmarked(applied);
   * ```
   */
  async toggle(
    target: SaveTarget,
    opts: { viewer?: string; input?: SaveBuildInput } = {}
  ): Promise<{ response: RelayResponse; applied: boolean }> {
    const exists = await this.has(target, { viewer: opts.viewer });
    if (exists) {
      const response = await this.remove(target);
      return { response, applied: false };
    }
    const response = await this.add(target, opts.input);
    return { response, applied: true };
  }

  /**
   * List a viewer's saved bookmarks (paginated). Wraps
   * `os.query.getSaves` with the same shape so apps can render a
   * "Saved" tab in one call.
   */
  async list(opts: {
    viewer: string;
    limit?: number;
    offset?: number;
  }): Promise<
    Array<{
      accountId: string;
      contentPath: string;
      value: string;
      blockHeight: number;
      blockTimestamp: number;
      operation: string;
    }>
  > {
    return this._query.getSaves(opts.viewer, {
      limit: opts.limit,
      offset: opts.offset,
    });
  }
}
