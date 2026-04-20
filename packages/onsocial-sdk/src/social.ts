// ---------------------------------------------------------------------------
// OnSocial SDK — social module (profiles, posts, standings, reactions)
//
// All object writes carry `v: 1` per the Base Social Schema. Profile is
// stored as scattered slash-keys (per-field) so it emits `profile/v` instead.
// See src/schema/v1.ts for the full spec.
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import { resolveContractId } from './contracts.js';
import { SCHEMA_VERSION } from './schema/v1.js';
import type { MediaRef } from './schema/v1.js';
import type {
  EntryView,
  KeyEntry,
  ListKeysOptions,
  PostData,
  ProfileData,
  ReactionData,
  RelayResponse,
} from './types.js';

export type SocialSetData = Record<string, unknown>;

const PROFILE_RESERVED_FIELDS = ['name', 'bio', 'avatar', 'links', 'tags'];

function encodeProfileField(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function buildProfileSetData(profile: ProfileData): SocialSetData {
  const data: SocialSetData = {
    'profile/v': String(SCHEMA_VERSION),
  };

  if (profile.name !== undefined) data['profile/name'] = profile.name;
  if (profile.bio !== undefined) data['profile/bio'] = profile.bio;
  if (profile.avatar !== undefined) data['profile/avatar'] = profile.avatar;
  if (profile.links !== undefined) {
    data['profile/links'] = encodeProfileField(profile.links);
  }
  if (profile.tags !== undefined) {
    data['profile/tags'] = encodeProfileField(profile.tags);
  }

  for (const [key, value] of Object.entries(profile)) {
    if (!PROFILE_RESERVED_FIELDS.includes(key) && value !== undefined) {
      data[`profile/${key}`] = encodeProfileField(value);
    }
  }

  return data;
}

export function buildPostSetData(
  post: PostData,
  postId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${postId}`]: {
      v: SCHEMA_VERSION,
      ...post,
      timestamp: post.timestamp ?? now,
    },
  };
}

/**
 * Build a reply post. The `parent` and `parentType` fields are picked up
 * by the substreams indexer and exposed via the `thread_replies` view.
 *
 * @param parentAuthor - account that owns the parent post
 * @param parentId     - id of the parent post (the part after `post/`)
 * @param post         - reply content
 * @param replyId      - id for the new reply
 * @param now          - timestamp override (defaults to Date.now())
 */
export function buildReplySetData(
  parentAuthor: string,
  parentId: string,
  post: PostData,
  replyId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${replyId}`]: {
      v: SCHEMA_VERSION,
      ...post,
      parent: `${parentAuthor}/post/${parentId}`,
      parentType: 'post',
      timestamp: post.timestamp ?? now,
    },
  };
}

/**
 * Build a quote post (the OnSocial equivalent of a repost / quote-tweet).
 * The `ref` and `refType` fields are picked up by the substreams indexer
 * and exposed via the `quotes` view.
 */
export function buildQuoteSetData(
  refAuthor: string,
  refPath: string,
  post: PostData,
  quoteId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${quoteId}`]: {
      v: SCHEMA_VERSION,
      ...post,
      ref: `${refAuthor}/${refPath}`,
      refType: 'quote',
      timestamp: post.timestamp ?? now,
    },
  };
}

/**
 * Build a post written into a group's content namespace. The contract stores
 * it under `groups/<groupId>/content/post/<postId>` — the `content/` segment
 * is required so default member write permissions (granted on the `content`
 * subpath at join time) authorize the write.
 *
 * Note: the enclosing `Set` action must target the group's owning account
 * (group owner) or be sent by a member with permission on `content`.
 */
export function buildGroupPostSetData(
  groupId: string,
  post: PostData,
  postId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`groups/${groupId}/content/post/${postId}`]: {
      v: SCHEMA_VERSION,
      ...post,
      timestamp: post.timestamp ?? now,
    },
  };
}

export function buildStandingSetData(
  targetAccount: string,
  now = Date.now()
): SocialSetData {
  return {
    [`standing/${targetAccount}`]: { v: SCHEMA_VERSION, since: now },
  };
}

export function buildStandingRemoveData(targetAccount: string): SocialSetData {
  return {
    [`standing/${targetAccount}`]: null,
  };
}

/**
 * Build a reaction write. v1 path layout: `reaction/<owner>/<kind>/<contentPath>`.
 *
 * Including the kind in the path lets a single reactor emit multiple reactions
 * to the same target (e.g. like + bookmark) without one overwriting the other.
 */
export function buildReactionSetData(
  ownerAccount: string,
  contentPath: string,
  reaction: ReactionData
): SocialSetData {
  const kind = String(reaction.type ?? '').trim();
  if (!kind) {
    throw new Error('reaction.type required to derive path');
  }
  return {
    [`reaction/${ownerAccount}/${kind}/${contentPath}`]: {
      v: SCHEMA_VERSION,
      ...reaction,
    },
  };
}

/** Build a reaction tombstone. Must be called with the same `kind` used to set. */
export function buildReactionRemoveData(
  ownerAccount: string,
  kind: string,
  contentPath: string
): SocialSetData {
  return {
    [`reaction/${ownerAccount}/${kind}/${contentPath}`]: null,
  };
}

// ── Saves (private bookmarks) ─────────────────────────────────────────────

export interface SaveBuildInput {
  folder?: string;
  note?: string;
  /** Override timestamp (defaults to Date.now()). */
  now?: number;
}

/**
 * Build a private save (bookmark). Path: `saved/<contentPath>`.
 * Personal/utility — never aggregated by indexers.
 */
export function buildSaveSetData(
  contentPath: string,
  input: SaveBuildInput = {}
): SocialSetData {
  const value: Record<string, unknown> = {
    v: SCHEMA_VERSION,
    timestamp: input.now ?? Date.now(),
  };
  if (input.folder !== undefined) value.folder = input.folder;
  if (input.note !== undefined) value.note = input.note;
  return { [`saved/${contentPath}`]: value };
}

export function buildSaveRemoveData(contentPath: string): SocialSetData {
  return { [`saved/${contentPath}`]: null };
}

// ── Endorsements (weighted directed vouch) ────────────────────────────────

export type EndorsementWeightInput = 1 | 2 | 3 | 4 | 5;

export interface EndorsementBuildInput {
  topic?: string;
  weight?: EndorsementWeightInput;
  note?: string;
  expiresAt?: number;
  /** Override timestamp (defaults to Date.now()). */
  now?: number;
}

/**
 * Build an endorsement. Path: `endorsement/<target>` or
 * `endorsement/<target>/<topic>` when `topic` is set.
 */
export function buildEndorsementSetData(
  targetAccount: string,
  input: EndorsementBuildInput = {}
): SocialSetData {
  const value: Record<string, unknown> = {
    v: SCHEMA_VERSION,
    since: input.now ?? Date.now(),
  };
  if (input.topic !== undefined) value.topic = input.topic;
  if (input.weight !== undefined) value.weight = input.weight;
  if (input.note !== undefined) value.note = input.note;
  if (input.expiresAt !== undefined) value.expiresAt = input.expiresAt;
  const path = input.topic
    ? `endorsement/${targetAccount}/${input.topic}`
    : `endorsement/${targetAccount}`;
  return { [path]: value };
}

export function buildEndorsementRemoveData(
  targetAccount: string,
  topic?: string
): SocialSetData {
  const path = topic
    ? `endorsement/${targetAccount}/${topic}`
    : `endorsement/${targetAccount}`;
  return { [path]: null };
}

// ── Attestations (verifiable typed claims) ────────────────────────────────

export interface AttestationSignatureInput {
  alg: string;
  sig: string;
  signer?: string;
}

export interface AttestationBuildInput {
  /** Free-string claim type; pattern: [a-z0-9][a-z0-9_-]{0,63} */
  type: string;
  /** Subject identifier (account, content path, or any opaque id). */
  subject: string;
  scope?: string;
  expiresAt?: number;
  /** Pre-pinned evidence references. */
  evidence?: MediaRef[];
  metadata?: Record<string, unknown>;
  signature?: AttestationSignatureInput;
  x?: Record<string, Record<string, unknown>>;
  /** Override issuedAt timestamp (defaults to Date.now()). */
  now?: number;
}

/**
 * Build an attestation. Path: `claims/<subject>/<type>/<claimId>`.
 * Written under the issuer's account namespace.
 */
export function buildAttestationSetData(
  claimId: string,
  input: AttestationBuildInput
): SocialSetData {
  if (!claimId) throw new Error('claimId required');
  if (!input.type) throw new Error('attestation.type required');
  if (!input.subject) throw new Error('attestation.subject required');
  const value: Record<string, unknown> = {
    v: SCHEMA_VERSION,
    type: input.type,
    subject: input.subject,
    issuedAt: input.now ?? Date.now(),
  };
  if (input.scope !== undefined) value.scope = input.scope;
  if (input.expiresAt !== undefined) value.expiresAt = input.expiresAt;
  if (input.evidence !== undefined) value.evidence = input.evidence;
  if (input.metadata !== undefined) value.metadata = input.metadata;
  if (input.signature !== undefined) value.signature = input.signature;
  if (input.x !== undefined) value.x = input.x;
  return {
    [`claims/${input.subject}/${input.type}/${claimId}`]: value,
  };
}

export function buildAttestationRemoveData(
  subject: string,
  type: string,
  claimId: string
): SocialSetData {
  return {
    [`claims/${subject}/${type}/${claimId}`]: null,
  };
}

function getSingleEntry(data: SocialSetData): [string, unknown] {
  const entries = Object.entries(data);
  if (entries.length !== 1) {
    throw new Error('Expected exactly one social data entry');
  }
  return entries[0];
}

function isFileLike(value: unknown): value is Blob | File {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

export class SocialModule {
  private _coreContract: string;

  constructor(private _http: HttpClient) {
    this._coreContract = resolveContractId(_http.network, 'core');
  }

  /**
   * Upload a file to IPFS via the gateway and return its `ipfs://<cid>` URL.
   * Used internally by `setProfile`/`post` to materialize file fields.
   */
  private async _uploadFile(file: Blob | File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const { cid } = await this._http.requestForm<{ cid: string }>(
      'POST',
      '/storage/upload',
      form
    );
    return `ipfs://${cid}`;
  }

  // ── Profiles ────────────────────────────────────────────────────────────

  /**
   * Create or update the current user's profile.
   *
   * `avatar` may be a string (URL/CID) or a `File`/`Blob` — the SDK uploads
   * any file to IPFS via the gateway and stores `ipfs://<cid>` in its place.
   *
   * ```ts
   * await os.social.setProfile({ name: 'Alice', bio: 'Builder' });
   * await os.social.setProfile({ name: 'Alice', avatar: file });
   * ```
   */
  async setProfile(profile: ProfileData): Promise<RelayResponse> {
    let resolved: ProfileData = profile;
    if (isFileLike(profile.avatar)) {
      const url = await this._uploadFile(profile.avatar);
      resolved = { ...profile, avatar: url };
    }
    const data = buildProfileSetData(resolved);

    return this._http.post<RelayResponse>('/compose/set', {
      path: 'profile',
      value: data,
      targetAccount: this._coreContract,
    });
  }

  // ── Posts ───────────────────────────────────────────────────────────────

  /**
   * Create a post.
   *
   * Pass `image: File` to attach a file — the SDK uploads it to IPFS via
   * the gateway and prepends `ipfs://<cid>` to `media[]`. The `image` field
   * itself is stripped from the stored post body.
   *
   * ```ts
   * await os.social.post({ text: 'Hello OnSocial!' });
   * await os.social.post({ text: 'gm', image: file });
   * ```
   */
  async post(post: PostData, postId?: string): Promise<RelayResponse> {
    let resolved: PostData = post;
    if (isFileLike(post.image)) {
      const url = await this._uploadFile(post.image);
      const { image: _drop, ...rest } = post;
      resolved = { ...rest, media: [url, ...(post.media ?? [])] };
    }
    const id = postId ?? Date.now().toString();
    const [path, value] = getSingleEntry(buildPostSetData(resolved, id));
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
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
    const [path, value] = getSingleEntry(buildStandingSetData(targetAccount));
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
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
    const [path, value] = getSingleEntry(
      buildStandingRemoveData(targetAccount)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
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
    reaction: ReactionData
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildReactionSetData(ownerAccount, contentPath, reaction)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  /**
   * Remove a previously-set reaction. Must specify the same `kind` used to react.
   *
   * ```ts
   * await os.social.unreact('bob.near', 'like', 'post/123');
   * ```
   */
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
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  // ── Replies & Quotes ──────────────────────────────────────────────────

  /**
   * Reply to a post.
   *
   * ```ts
   * await os.social.reply('alice.near', '1713456789', { text: 'Great post!' });
   * ```
   */
  async reply(
    parentAuthor: string,
    parentId: string,
    post: PostData,
    replyId?: string
  ): Promise<RelayResponse> {
    const id = replyId ?? Date.now().toString();
    const [path, value] = getSingleEntry(
      buildReplySetData(parentAuthor, parentId, post, id)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  /**
   * Quote a post.
   *
   * ```ts
   * await os.social.quote('alice.near', 'post/1713456789', { text: 'This!' });
   * ```
   */
  async quote(
    refAuthor: string,
    refPath: string,
    post: PostData,
    quoteId?: string
  ): Promise<RelayResponse> {
    const id = quoteId ?? Date.now().toString();
    const [path, value] = getSingleEntry(
      buildQuoteSetData(refAuthor, refPath, post, id)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  // ── Saves (bookmarks) ────────────────────────────────────────────────

  /**
   * Save / bookmark content.
   *
   * ```ts
   * await os.social.save('alice.near/post/123');
   * await os.social.save('alice.near/post/123', { folder: 'inspiration' });
   * ```
   */
  async save(
    contentPath: string,
    input?: SaveBuildInput
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildSaveSetData(contentPath, input)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  /**
   * Remove a saved bookmark.
   *
   * ```ts
   * await os.social.unsave('alice.near/post/123');
   * ```
   */
  async unsave(contentPath: string): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(buildSaveRemoveData(contentPath));
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  // ── Endorsements ──────────────────────────────────────────────────────

  /**
   * Endorse another account.
   *
   * ```ts
   * await os.social.endorse('bob.near');
   * await os.social.endorse('bob.near', { topic: 'rust', weight: 5 });
   * ```
   */
  async endorse(
    targetAccount: string,
    input?: EndorsementBuildInput
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildEndorsementSetData(targetAccount, input)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  /**
   * Remove an endorsement.
   *
   * ```ts
   * await os.social.unendorse('bob.near');
   * await os.social.unendorse('bob.near', 'rust');
   * ```
   */
  async unendorse(
    targetAccount: string,
    topic?: string
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildEndorsementRemoveData(targetAccount, topic)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  // ── Attestations ──────────────────────────────────────────────────────

  /**
   * Create an attestation (verifiable claim).
   *
   * ```ts
   * await os.social.attest('claim-1', {
   *   type: 'skill',
   *   subject: 'bob.near',
   *   scope: 'blockchain',
   * });
   * ```
   */
  async attest(
    claimId: string,
    input: AttestationBuildInput
  ): Promise<RelayResponse> {
    const [path, value] = getSingleEntry(
      buildAttestationSetData(claimId, input)
    );
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  /**
   * Revoke an attestation.
   *
   * ```ts
   * await os.social.revokeAttestation('bob.near', 'skill', 'claim-1');
   * ```
   */
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
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
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
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value,
      targetAccount: this._coreContract,
    });
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
