// ---------------------------------------------------------------------------
// OnSocial SDK — social module
//
// `SocialModule` exposes two layers:
//
//   • Public primitives — `set` / `get` / `getOne` / `listKeys` / `countKeys`.
//     These are the low-level NEAR-Social KV surface.
//
//   • @internal helpers — `setProfile / post / reply / quote / react / save /
//     endorse / stand / attest / …`. App code should use the dedicated noun
//     modules instead (`os.profiles`, `os.posts`, `os.reactions`, `os.saves`,
//     `os.endorsements`, `os.attestations`, `os.standings`); those modules
//     delegate here. The helpers are tagged `@internal` so they don't surface
//     in the primary autocomplete / generated docs.
//
// Pure payload builders (`buildPostSetData`, `buildReactionSetData`, …)
// live in `src/builders/*` and are re-exported below for back-compat.
// New consumers should import them directly from `./builders/index.js`
// or from `@onsocial/sdk/advanced`.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../internal/http.js';
import { resolveContractId } from '../internal/contracts.js';
import {
  composeAndSign,
  signAndRelay,
  type SessionGetter,
  type BroadcastGetter,
} from '../internal/session-bridge.js';
import type { StorageProvider } from '../storage/provider.js';
import { GatewayProvider } from '../storage/provider.js';
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
} from '../types.js';

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
  resolveEndorsementBuildInput,
  isMediaRef,
  isFileLike,
  type SocialSetData,
  type SaveBuildInput,
  type EndorsementBuildInput,
  type AttestationBuildInput,
} from '../builders/index.js';

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
  normalizeEndorsementTopic,
  buildAttestationSetData,
  buildAttestationRemoveData,
  resolvePostMedia,
} from '../builders/index.js';
export type {
  SocialSetData,
  SaveBuildInput,
  EndorsementBuildInput,
  AttestationBuildInput,
  AttestationSignatureInput,
} from '../builders/index.js';

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
    private _getSession: SessionGetter,
    storage?: StorageProvider,
    private _getBroadcast?: BroadcastGetter
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

  private _broadcastOpts():
    | { broadcast: ReturnType<BroadcastGetter> }
    | undefined {
    const b = this._getBroadcast?.();
    return b !== undefined ? { broadcast: b } : undefined;
  }

  private _composeSet(
    body: { path: string; value: unknown; targetAccount: string },
    methodLabel: string,
    extraOpts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      'set',
      body,
      methodLabel,
      { ...this._broadcastOpts(), ...extraOpts }
    );
  }

  // ── Profiles ────────────────────────────────────────────────────────────
  // Prefer `os.profiles.update()` for app code.

  /** @internal Use `os.profiles.update()`. */
  async setProfile(
    profile: ProfileData,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    let resolved: ProfileData = profile;

    for (const [fieldName, value] of Object.entries(profile)) {
      if (!isFileLike(value)) continue;
      const url = await this._uploadFile(value);
      resolved = { ...resolved, [fieldName]: url };
    }

    const data = buildProfileSetData(resolved);

    return this._composeSet(
      {
        path: 'profile',
        value: data,
        targetAccount: this._coreContract,
      },
      'social.setProfile',
      opts
    );
  }

  // ── Posts ───────────────────────────────────────────────────────────────
  // Prefer `os.posts.create() / .reply() / .quote()` for app code.

  /** @internal Use `os.posts.create()`. */
  async post(
    post: PostData,
    postId?: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const resolved = await resolvePostMedia(post, this._storage);
    const id = postId ?? Date.now().toString();
    const [path, value] = getSingleEntry(buildPostSetData(resolved, id));
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.post',
      opts
    );
  }

  /** @internal Use `os.posts.reply()`. */
  async reply(
    parentAuthor: string,
    parentId: string,
    post: PostData,
    replyId?: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const id = replyId ?? Date.now().toString();
    const resolved = await resolvePostMedia(post, this._storage);
    const [path, value] = getSingleEntry(
      buildReplySetData(parentAuthor, parentId, resolved, id)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.reply',
      opts
    );
  }

  /** @internal Use `os.posts.reply()`. */
  async replyToPost(
    post: PostRef,
    reply: PostData,
    replyId?: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return this.reply(post.author, post.postId, reply, replyId, opts);
  }

  /** @internal Use `os.posts.quote()`. */
  async quote(
    refAuthor: string,
    refPath: string,
    post: PostData,
    quoteId?: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const id = quoteId ?? Date.now().toString();
    const resolved = await resolvePostMedia(post, this._storage);
    const [path, value] = getSingleEntry(
      buildQuoteSetData(refAuthor, refPath, resolved, id)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.quote',
      opts
    );
  }

  /** @internal Use `os.posts.quote()`. */
  async quotePost(
    post: PostRef,
    quote: PostData,
    quoteId?: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return this.quote(post.author, `post/${post.postId}`, quote, quoteId, opts);
  }

  // ── Standings ───────────────────────────────────────────────────────────
  // Prefer `os.standings.add() / .remove() / .toggle() / .has()` for app code.

  /** @internal Use `os.standings.add()`. */
  async standWith(
    targetAccount: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(buildStandingSetData(targetAccount));
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.standWith',
      opts
    );
  }

  /** @internal Use `os.standings.remove()`. */
  async unstand(
    targetAccount: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildStandingRemoveData(targetAccount)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.unstand',
      opts
    );
  }

  // ── Reactions ───────────────────────────────────────────────────────────
  // Prefer `os.reactions.add() / .remove() / .toggle() / .summary()` for app code.

  /** @internal Use `os.reactions.add()`. */
  async react(
    ownerAccount: string,
    contentPath: string,
    reaction: ReactionData,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildReactionSetData(ownerAccount, contentPath, reaction)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.react',
      opts
    );
  }

  /** @internal Use `os.reactions.add()`. */
  async reactToPost(
    post: PostRef,
    reaction: ReactionData,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return this.react(post.author, `post/${post.postId}`, reaction, opts);
  }

  /** @internal Use `os.reactions.remove()`. */
  async unreact(
    ownerAccount: string,
    kind: string,
    contentPath: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildReactionRemoveData(ownerAccount, kind, contentPath)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.unreact',
      opts
    );
  }

  /** @internal Use `os.reactions.remove()`. */
  async unreactFromPost(
    post: PostRef,
    kind: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return this.unreact(post.author, kind, `post/${post.postId}`, opts);
  }

  // ── Saves (bookmarks) ────────────────────────────────────────────────
  // Prefer `os.saves.add() / .remove() / .toggle() / .has() / .list()` for app code.

  /** @internal Use `os.saves.add()`. */
  async save(
    contentPath: string,
    input?: SaveBuildInput,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(buildSaveSetData(contentPath, input));
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.save',
      opts
    );
  }

  /** @internal Use `os.saves.get()`. */
  async getSave(
    contentPath: string,
    accountId?: string
  ): Promise<SaveRecord | null> {
    const entry = await this.getOne(`saved/${contentPath}`, accountId);
    const value = parseStructuredEntry<Omit<SaveRecord, 'contentPath'>>(entry);
    if (!value) return null;
    return { contentPath, ...value } as SaveRecord;
  }

  /** @internal Use `os.saves.remove()`. */
  async unsave(
    contentPath: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(buildSaveRemoveData(contentPath));
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.unsave',
      opts
    );
  }

  // ── Endorsements ──────────────────────────────────────────────────────
  // Prefer `os.endorsements.*` for app code.

  /** @internal Use `os.endorsements.add()`. */
  async endorse(
    targetAccount: string,
    input?: EndorsementBuildInput,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const existing = await this.getEndorsement(targetAccount, {
      topic: input?.topic,
    });
    const resolved = await resolveEndorsementBuildInput(
      input ?? {},
      this._storage,
      {
        existingId:
          input?.id ??
          (typeof existing?.id === 'string' ? existing.id : undefined),
        isEdit: Boolean(input?.id || existing),
        preserveMedia: isMediaRef(existing?.media) ? existing.media : undefined,
      }
    );
    const [path, value] = getSingleEntry(
      buildEndorsementSetData(targetAccount, resolved)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.endorse',
      opts
    );
  }

  /** @internal Use `os.endorsements.get()`. */
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

  /** @internal Use `os.endorsements.remove()`. */
  async unendorse(
    targetAccount: string,
    topic?: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildEndorsementRemoveData(targetAccount, topic)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.unendorse',
      opts
    );
  }

  // ── Attestations ──────────────────────────────────────────────────────
  // Prefer `os.attestations.*` for app code.

  /** @internal Use `os.attestations.add()`. */
  async attest(
    claimId: string,
    input: AttestationBuildInput,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildAttestationSetData(claimId, input)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.attest',
      opts
    );
  }

  /** @internal Use `os.attestations.get()`. */
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

  /** @internal Use `os.attestations.revoke()`. */
  async revokeAttestation(
    subject: string,
    type: string,
    claimId: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildAttestationRemoveData(subject, type, claimId)
    );
    return this._composeSet(
      {
        path,
        value: encodeComposeValue(value),
        targetAccount: this._coreContract,
      },
      'social.revokeAttestation',
      opts
    );
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
  async set(
    path: string,
    value: unknown,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse>;
  async set(
    entries: Record<string, unknown>,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse>;
  async set(
    pathOrEntries: string | Record<string, unknown>,
    valueOrOpts?: unknown,
    maybeOpts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    if (typeof pathOrEntries === 'string') {
      return this._composeSet(
        {
          path: pathOrEntries,
          value: encodeComposeValue(valueOrOpts),
          targetAccount: this._coreContract,
        },
        'social.set',
        maybeOpts
      );
    }
    const opts = valueOrOpts as { wait?: boolean } | undefined;
    const entries = Object.entries(pathOrEntries);
    if (entries.length === 0) {
      throw new Error('social.set() requires at least one entry');
    }
    if (entries.length === 1) {
      const [path, val] = entries[0];
      return this._composeSet(
        {
          path,
          value: encodeComposeValue(val),
          targetAccount: this._coreContract,
        },
        'social.set',
        opts
      );
    }
    const action = { type: 'set', data: pathOrEntries };
    return signAndRelay(
      this._http,
      this._getSession(),
      action,
      this._coreContract,
      'social.set',
      { ...this._broadcastOpts(), ...opts }
    );
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
