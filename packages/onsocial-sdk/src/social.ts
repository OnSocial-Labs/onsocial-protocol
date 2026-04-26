// ---------------------------------------------------------------------------
// OnSocial SDK — social module
//
// `SocialModule` is the raw NEAR-Social write/read surface. It carries the
// `set` / `get` / `getOne` / `listKeys` / `countKeys` primitives plus the
// internal `setProfile / post / reply / quote / react / save / endorse /
// stand / attest / …` helpers that the per-noun modules (`os.posts`,
// `os.reactions`, `os.saves`, `os.endorsements`, `os.attestations`,
// `os.standings`, `os.profiles`) delegate to.
//
// Pure payload builders (`buildPostSetData`, `buildReactionSetData`, …)
// live in `src/builders/*` and are re-exported below for back-compat.
// New consumers should import them directly from `./builders/index.js`
// or from `@onsocial/sdk/advanced`.
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import { resolveContractId } from './contracts.js';
import type { StorageProvider } from './storage/provider.js';
import { GatewayProvider } from './storage/provider.js';
import type {
  AttestationRecord,
  EntryView,
  EndorsementRecord,
  KeyEntry,
  ListKeysOptions,
  PostData,
  PostRef,
  ProfileData,
  ReactionData,
  RelayResponse,
  SaveRecord,
} from './types.js';

import {
  buildProfileSetData,
  buildPostSetData,
  buildReplySetData,
  buildQuoteSetData,
  buildStandingSetData,
  buildStandingRemoveData,
  buildReactionSetData,
  buildReactionRemoveData,
  buildSaveSetData,
  buildSaveRemoveData,
  buildEndorsementSetData,
  buildEndorsementRemoveData,
  buildAttestationSetData,
  buildAttestationRemoveData,
  resolvePostMedia,
  isFileLike,
  type SocialSetData,
  type SaveBuildInput,
  type EndorsementBuildInput,
  type AttestationBuildInput,
} from './builders/index.js';

// ── Back-compat re-exports ──────────────────────────────────────────────────
//
// The pure builders moved to `./builders/*` but have always been part of
// the public surface. Re-export them here so existing imports of the form
// `import { buildPostSetData } from '@onsocial/sdk'` keep working.

export {
  buildProfileSetData,
  buildPostSetData,
  buildReplySetData,
  buildQuoteSetData,
  buildGroupPostSetData,
  buildGroupPostPath,
  buildGroupReplySetData,
  buildGroupQuoteSetData,
  buildStandingSetData,
  buildStandingRemoveData,
  buildReactionSetData,
  buildReactionRemoveData,
  buildSaveSetData,
  buildSaveRemoveData,
  buildEndorsementSetData,
  buildEndorsementRemoveData,
  buildAttestationSetData,
  buildAttestationRemoveData,
  resolvePostMedia,
} from './builders/index.js';
export type {
  SocialSetData,
  SaveBuildInput,
  EndorsementBuildInput,
  EndorsementWeightInput,
  AttestationBuildInput,
  AttestationSignatureInput,
} from './builders/index.js';

// ── Module-private helpers ─────────────────────────────────────────────────

function encodeComposeValue(value: unknown): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function getSingleEntry(data: SocialSetData): [string, unknown] {
  const entries = Object.entries(data);
  if (entries.length !== 1) {
    throw new Error('Expected exactly one social data entry');
  }
  return entries[0];
}

function parseStructuredEntry<T extends Record<string, unknown>>(
  entry: EntryView
): T | null {
  if (entry.deleted || entry.value == null) {
    return null;
  }
  const rawValue: unknown = entry.value;
  let parsedValue: unknown = rawValue;
  if (typeof parsedValue === 'string') {
    try {
      parsedValue = JSON.parse(parsedValue) as unknown;
    } catch {
      return null;
    }
  }
  if (
    !parsedValue ||
    typeof parsedValue !== 'object' ||
    Array.isArray(parsedValue)
  ) {
    return null;
  }
  return parsedValue as T;
}

// ── Module ─────────────────────────────────────────────────────────────────

export class SocialModule {
  private _coreContract: string;
  private _storage: StorageProvider;

  constructor(
    private _http: HttpClient,
    storage?: StorageProvider
  ) {
    this._coreContract = resolveContractId(_http.network, 'core');
    this._storage = storage ?? new GatewayProvider(_http);
  }

  /** Expose the configured StorageProvider (used by PostsModule / groups). */
  get storage(): StorageProvider {
    return this._storage;
  }

  private async _uploadFile(file: Blob | File): Promise<string> {
    const uploaded = await this._storage.upload(file);
    return `ipfs://${uploaded.cid}`;
  }

  // ── Profiles ────────────────────────────────────────────────────────────
  // Prefer `os.profiles.update()` for app code.

  async setProfile(profile: ProfileData): Promise<RelayResponse> {
    let resolved: ProfileData = profile;
    if (isFileLike(profile.avatar)) {
      const url = await this._uploadFile(profile.avatar);
      resolved = { ...resolved, avatar: url };
    }
    if (isFileLike(resolved.banner)) {
      const url = await this._uploadFile(resolved.banner);
      resolved = { ...resolved, banner: url };
    }
    const data = buildProfileSetData(resolved);

    return this._http.post<RelayResponse>('/compose/set', {
      path: 'profile',
      value: data,
      targetAccount: this._coreContract,
    });
  }

  // ── Posts ───────────────────────────────────────────────────────────────
  // Prefer `os.posts.create() / .reply() / .quote()` for app code.

  async post(post: PostData, postId?: string): Promise<RelayResponse> {
    const resolved = await resolvePostMedia(post, this._storage);
    const id = postId ?? Date.now().toString();
    const [path, value] = getSingleEntry(buildPostSetData(resolved, id));
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async reply(
    parentAuthor: string,
    parentId: string,
    post: PostData,
    replyId?: string
  ): Promise<RelayResponse> {
    const id = replyId ?? Date.now().toString();
    const resolved = await resolvePostMedia(post, this._storage);
    const [path, value] = getSingleEntry(
      buildReplySetData(parentAuthor, parentId, resolved, id)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async replyToPost(
    post: PostRef,
    reply: PostData,
    replyId?: string
  ): Promise<RelayResponse> {
    return this.reply(post.author, post.postId, reply, replyId);
  }

  async quote(
    refAuthor: string,
    refPath: string,
    post: PostData,
    quoteId?: string
  ): Promise<RelayResponse> {
    const id = quoteId ?? Date.now().toString();
    const resolved = await resolvePostMedia(post, this._storage);
    const [path, value] = getSingleEntry(
      buildQuoteSetData(refAuthor, refPath, resolved, id)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async quotePost(
    post: PostRef,
    quote: PostData,
    quoteId?: string
  ): Promise<RelayResponse> {
    return this.quote(post.author, `post/${post.postId}`, quote, quoteId);
  }

  // ── Standings ───────────────────────────────────────────────────────────
  // Prefer `os.standings.add() / .remove() / .toggle() / .has()` for app code.

  async standWith(targetAccount: string): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(buildStandingSetData(targetAccount));
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async unstand(targetAccount: string): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildStandingRemoveData(targetAccount)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  // ── Reactions ───────────────────────────────────────────────────────────
  // Prefer `os.reactions.add() / .remove() / .toggle() / .summary()` for app code.

  async react(
    ownerAccount: string,
    contentPath: string,
    reaction: ReactionData
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildReactionSetData(ownerAccount, contentPath, reaction)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async reactToPost(
    post: PostRef,
    reaction: ReactionData
  ): Promise<RelayResponse> {
    return this.react(post.author, `post/${post.postId}`, reaction);
  }

  async unreact(
    ownerAccount: string,
    kind: string,
    contentPath: string
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildReactionRemoveData(ownerAccount, kind, contentPath)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async unreactFromPost(post: PostRef, kind: string): Promise<RelayResponse> {
    return this.unreact(post.author, kind, `post/${post.postId}`);
  }

  // ── Saves (bookmarks) ────────────────────────────────────────────────
  // Prefer `os.saves.add() / .remove() / .toggle() / .has() / .list()` for app code.

  async save(
    contentPath: string,
    input?: SaveBuildInput
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(buildSaveSetData(contentPath, input));
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async getSave(
    contentPath: string,
    accountId?: string
  ): Promise<SaveRecord | null> {
    const entry = await this.getOne(`saved/${contentPath}`, accountId);
    const value = parseStructuredEntry<Omit<SaveRecord, 'contentPath'>>(entry);
    if (!value) return null;
    return { contentPath, ...value } as SaveRecord;
  }

  async unsave(contentPath: string): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(buildSaveRemoveData(contentPath));
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  // ── Endorsements ──────────────────────────────────────────────────────
  // Prefer `os.endorsements.*` for app code.

  async endorse(
    targetAccount: string,
    input?: EndorsementBuildInput
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildEndorsementSetData(targetAccount, input)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async getEndorsement(
    targetAccount: string,
    opts?: { topic?: string; accountId?: string }
  ): Promise<EndorsementRecord | null> {
    const path = opts?.topic
      ? `endorsement/${targetAccount}/${opts.topic}`
      : `endorsement/${targetAccount}`;
    const entry = await this.getOne(path, opts?.accountId);
    const value =
      parseStructuredEntry<Omit<EndorsementRecord, 'target'>>(entry);
    if (!value) return null;
    return { target: targetAccount, ...value } as EndorsementRecord;
  }

  async unendorse(
    targetAccount: string,
    topic?: string
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildEndorsementRemoveData(targetAccount, topic)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  // ── Attestations ──────────────────────────────────────────────────────
  // Prefer `os.attestations.*` for app code.

  async attest(
    claimId: string,
    input: AttestationBuildInput
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildAttestationSetData(claimId, input)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  async getAttestation(
    subject: string,
    type: string,
    claimId: string,
    accountId?: string
  ): Promise<AttestationRecord | null> {
    const entry = await this.getOne(
      `claims/${subject}/${type}/${claimId}`,
      accountId
    );
    const value =
      parseStructuredEntry<
        Omit<AttestationRecord, 'claimId' | 'subject' | 'type'>
      >(entry);
    if (!value) return null;
    return { claimId, subject, type, ...value } as AttestationRecord;
  }

  async revokeAttestation(
    subject: string,
    type: string,
    claimId: string
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildAttestationRemoveData(subject, type, claimId)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: encodeComposeValue(value),
      targetAccount: this._coreContract,
    });
  }

  // ── Generic KV write ──────────────────────────────────────────────────

  /**
   * Write arbitrary data to a path, or atomically batch multiple paths.
   *
   * ```ts
   * // Single path
   * await os.social.set('settings/theme', JSON.stringify({ dark: true }));
   *
   * // Batch (atomic) — single Action::Set, single tx
   * await os.social.set({
   *   'profile/name': 'Alice',
   *   'profile/bio': 'Builder',
   *   'posts/main/2026-04-26': { text: 'gm' },
   * });
   * ```
   */
  async set(path: string, value: unknown): Promise<RelayResponse>;
  async set(entries: Record<string, unknown>): Promise<RelayResponse>;
  async set(
    pathOrEntries: string | Record<string, unknown>,
    value?: unknown
  ): Promise<RelayResponse> {
    if (typeof pathOrEntries === 'string') {
      return this._http.post<RelayResponse>('/compose/set', {
        path: pathOrEntries,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      });
    }
    const entries = Object.entries(pathOrEntries);
    if (entries.length === 0) {
      throw new Error('social.set() requires at least one entry');
    }
    if (entries.length === 1) {
      const [path, val] = entries[0];
      return this._http.post<RelayResponse>('/compose/set', {
        path,
        value: encodeComposeValue(val),
        targetAccount: this._coreContract,
      });
    }
    // Multi-entry: route through generic execute so we get a single
    // Action::Set { data: { path1: value1, … } } in one transaction.
    const action = { type: 'set', data: pathOrEntries };
    return this._http.post<RelayResponse>('/relay/execute?wait=true', {
      action,
      target_account: this._coreContract,
    });
  }

  // ── On-chain reads ────────────────────────────────────────────────────

  /** Read one or more entries by key directly from the contract. */
  async get(keys: string[], accountId?: string): Promise<EntryView[]> {
    const params = new URLSearchParams({ keys: keys.join(',') });
    if (accountId) params.set('accountId', accountId);
    return this._http.get<EntryView[]>(`/data/get?${params}`);
  }

  /** Read a single entry by key directly from the contract. */
  async getOne(key: string, accountId?: string): Promise<EntryView> {
    const params = new URLSearchParams({ key });
    if (accountId) params.set('accountId', accountId);
    return this._http.get<EntryView>(`/data/get-one?${params}`);
  }

  /** List keys matching a prefix with cursor-based pagination. */
  async listKeys(opts: ListKeysOptions): Promise<KeyEntry[]> {
    const params = new URLSearchParams({ prefix: opts.prefix });
    if (opts.fromKey) params.set('fromKey', opts.fromKey);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.withValues) params.set('withValues', 'true');
    return this._http.get<KeyEntry[]>(`/data/keys?${params}`);
  }

  /** Count keys matching a prefix. */
  async countKeys(prefix: string): Promise<{ count: number }> {
    const params = new URLSearchParams({ prefix });
    return this._http.get<{ count: number }>(`/data/count?${params}`);
  }
}
