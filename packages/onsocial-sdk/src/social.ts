// ---------------------------------------------------------------------------
// OnSocial SDK — social module (profiles, posts, standings, reactions)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type {
  EntryView,
  KeyEntry,
  ListKeysOptions,
  PostData,
  ProfileData,
  ReactionData,
  RelayResponse,
} from './types.js';

export class SocialModule {
  constructor(private _http: HttpClient) {}

  // ── Profiles ────────────────────────────────────────────────────────────

  /**
   * Create or update the current user's profile.
   *
   * ```ts
   * await os.social.setProfile({ name: 'Alice', bio: 'Builder' });
   * ```
   */
  async setProfile(profile: ProfileData): Promise<RelayResponse> {
    const data: Record<string, string> = {};
    if (profile.name !== undefined) data['profile/name'] = profile.name;
    if (profile.bio !== undefined) data['profile/bio'] = profile.bio;
    if (profile.avatar !== undefined) data['profile/avatar'] = profile.avatar;
    if (profile.links !== undefined)
      data['profile/links'] = JSON.stringify(profile.links);
    if (profile.tags !== undefined)
      data['profile/tags'] = JSON.stringify(profile.tags);

    // Forward any extra keys as-is
    for (const [k, v] of Object.entries(profile)) {
      if (!['name', 'bio', 'avatar', 'links', 'tags'].includes(k)) {
        data[`profile/${k}`] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }

    return this._http.post<RelayResponse>('/compose/set', {
      path: 'profile',
      value: data,
    });
  }

  // ── Posts ───────────────────────────────────────────────────────────────

  /**
   * Create a post.
   *
   * ```ts
   * await os.social.post({ text: 'Hello OnSocial!' });
   * ```
   */
  async post(post: PostData, postId?: string): Promise<RelayResponse> {
    const id = postId ?? Date.now().toString();
    return this._http.post<RelayResponse>('/compose/set', {
      path: `post/${id}`,
      value: JSON.stringify({
        ...post,
        timestamp: post.timestamp ?? Date.now(),
      }),
    });
  }

  // ── Standings ───────────────────────────────────────────────────────────

  /**
   * Stand with another user.
   *
   * ```ts
   * await os.social.standWith('bob.near');
   * ```
   */
  async standWith(targetAccount: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/set', {
      path: `standing/${targetAccount}`,
      value: JSON.stringify({ since: Date.now() }),
    });
  }

  /**
   * Remove a standing.
   *
   * ```ts
   * await os.social.unstand('bob.near');
   * ```
   */
  async unstand(targetAccount: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/set', {
      path: `standing/${targetAccount}`,
      value: '',
    });
  }

  // ── Reactions ───────────────────────────────────────────────────────────

  /**
   * React to content.
   *
   * ```ts
   * await os.social.react('bob.near', 'post/123', { type: 'like' });
   * ```
   */
  async react(
    ownerAccount: string,
    contentPath: string,
    reaction: ReactionData,
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/set', {
      path: `reaction/${ownerAccount}/${contentPath}`,
      value: JSON.stringify(reaction),
    });
  }

  // ── Generic KV write ──────────────────────────────────────────────────

  /**
   * Write arbitrary data to a path.
   *
   * ```ts
   * await os.social.set('settings/theme', JSON.stringify({ dark: true }));
   * ```
   */
  async set(path: string, value: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/set', { path, value });
  }

  // ── On-chain reads ────────────────────────────────────────────────────

  /**
   * Read one or more entries by key directly from the contract.
   *
   * ```ts
   * const entries = await os.social.get(['profile/name', 'profile/bio'], 'alice.near');
   * ```
   */
  async get(keys: string[], accountId?: string): Promise<EntryView[]> {
    const params = new URLSearchParams({ keys: keys.join(',') });
    if (accountId) params.set('accountId', accountId);
    return this._http.get<EntryView[]>(`/data/get?${params}`);
  }

  /**
   * Read a single entry by key directly from the contract.
   *
   * ```ts
   * const entry = await os.social.getOne('profile/name', 'alice.near');
   * console.log(entry.value);
   * ```
   */
  async getOne(key: string, accountId?: string): Promise<EntryView> {
    const params = new URLSearchParams({ key });
    if (accountId) params.set('accountId', accountId);
    return this._http.get<EntryView>(`/data/get-one?${params}`);
  }

  /**
   * List keys matching a prefix with cursor-based pagination.
   *
   * ```ts
   * const keys = await os.social.listKeys({ prefix: 'myapp/', limit: 20 });
   * ```
   */
  async listKeys(opts: ListKeysOptions): Promise<KeyEntry[]> {
    const params = new URLSearchParams({ prefix: opts.prefix });
    if (opts.fromKey) params.set('fromKey', opts.fromKey);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.withValues) params.set('withValues', 'true');
    return this._http.get<KeyEntry[]>(`/data/keys?${params}`);
  }

  /**
   * Count keys matching a prefix.
   *
   * ```ts
   * const { count } = await os.social.countKeys('post/');
   * ```
   */
  async countKeys(prefix: string): Promise<{ count: number }> {
    const params = new URLSearchParams({ prefix });
    return this._http.get<{ count: number }>(`/data/count?${params}`);
  }
}
