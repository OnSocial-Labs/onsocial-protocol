// ---------------------------------------------------------------------------
// @onsocial/sdk — Base Social Schema v1
//
// Versioned, typed shapes for every object stored under the OnSocial base
// social schema. Apps that conform to this spec interoperate cleanly within
// the shared social ecosystem.
//
// Rules:
//  • Every object carries `v: 1`.
//  • Unknown standardised fields are added under `x.<yourAppId>.<field>`.
//  • Deletion is performed by writing `null` at the path (tombstone).
//  • Timestamps are unix milliseconds (client-supplied; indexer also has
//    block_timestamp for source-of-truth ordering).
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1 as const;

// ── Media ───────────────────────────────────────────────────────────────────

export interface MediaRef {
  /** IPFS CID (no scheme prefix). Renderers prepend `ipfs://` or a gateway. */
  cid: string;
  /** MIME type, e.g. `image/webp`, `video/mp4`. */
  mime: string;
  size?: number;
  width?: number;
  height?: number;
  alt?: string;
  blurhash?: string;
}

// ── Profile ─────────────────────────────────────────────────────────────────

export interface ProfileV1 {
  v: 1;
  /** Lowercase short name, `[a-z0-9_]{1,32}`. Optional but recommended. */
  handle?: string;
  displayName?: string;
  bio?: string;
  avatar?: MediaRef;
  banner?: MediaRef;
  links?: ProfileLink[];
  tags?: string[];
  /** BCP-47 language tag, e.g. `en`, `pt-BR`. */
  lang?: string;
  /** Extension namespace; only `x.<appId>.<field>` is permitted. */
  x?: Record<string, Record<string, unknown>>;
}

export interface ProfileLink {
  label: string;
  url: string;
}

// ── Post ────────────────────────────────────────────────────────────────────

export type ParentType = 'post' | 'comment';
export type RefType = 'quote' | 'cite' | 'embed';
export type AccessLevel = 'public' | 'private' | 'group';
export type ContentType = 'text' | 'md';

export interface PostV1 {
  v: 1;
  text: string;
  contentType?: ContentType;
  lang?: string;
  media?: MediaRef[];
  /** Account ids mentioned in this post. Indexer uses for mention notifications. */
  mentions?: string[];
  /** Lowercase, no leading `#`. */
  hashtags?: string[];
  embeds?: Embed[];

  // Indexer-recognised reference fields (substreams expects these names).
  parent?: string;
  parentType?: ParentType;
  ref?: string;
  refType?: RefType;
  refs?: string[];

  access?: AccessLevel;
  groupId?: string;

  /** Free-form spoiler/NSFW indicator. Presence ⇒ hide content by default. */
  contentWarning?: string;

  /** Hard NSFW flag for app-store / safe-mode filtering. */
  nsfw?: boolean;

  /** Unix milliseconds; clients SHOULD set this. */
  timestamp: number;

  x?: Record<string, Record<string, unknown>>;
}

export type Embed =
  | {
      kind: 'link';
      url: string;
      title?: string;
      description?: string;
      image?: MediaRef;
    }
  | { kind: 'token'; chain: string; contract: string; tokenId?: string }
  | { kind: 'poll'; question: string; options: string[]; closesAt?: number };

// ── Reactions ──────────────────────────────────────────────────────────────

export const REACTION_KINDS = [
  'like',
  'love',
  'laugh',
  'wow',
  'sad',
  'fire',
  'celebrate',
  'thinking',
] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

export interface ReactionV1 {
  v: 1;
  type: ReactionKind;
  /** Optional custom emoji escape hatch when the controlled set is insufficient. */
  emoji?: string;
  timestamp: number;
}

// ── Standing ───────────────────────────────────────────────────────────────

export interface StandingV1 {
  v: 1;
  since: number;
  note?: string;
  /** Optional time-bounded standing (unix ms). */
  expiresAt?: number;
}

// ── Group config ───────────────────────────────────────────────────────────

export interface GroupConfigV1 {
  v: 1;
  name: string;
  description?: string;
  avatar?: MediaRef;
  isPrivate: boolean;
  memberDriven?: boolean;
  tags?: string[];
  x?: Record<string, Record<string, unknown>>;
}

// ── Validators ─────────────────────────────────────────────────────────────
// Hand-rolled, zero-dependency. Each `validate*` returns null on success or
// a human-readable error string. `assert*` throws.

const HANDLE_RE = /^[a-z0-9_]{1,32}$/;
const HASHTAG_RE = /^[a-z0-9_]{1,64}$/;
const BCP47_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isPlainObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateMedia(m: unknown): string | null {
  if (!isPlainObj(m)) return 'media must be an object';
  if (!isStr(m.cid) || m.cid.length === 0) return 'media.cid required';
  if (!isStr(m.mime) || m.mime.length === 0) return 'media.mime required';
  if (m.size !== undefined && !isNum(m.size))
    return 'media.size must be number';
  if (m.width !== undefined && !isNum(m.width))
    return 'media.width must be number';
  if (m.height !== undefined && !isNum(m.height))
    return 'media.height must be number';
  if (m.alt !== undefined && !isStr(m.alt)) return 'media.alt must be string';
  if (m.blurhash !== undefined && !isStr(m.blurhash))
    return 'media.blurhash must be string';
  return null;
}

function validateExtensions(x: unknown): string | null {
  if (x === undefined) return null;
  if (!isPlainObj(x)) return 'x must be an object';
  for (const key of Object.keys(x)) {
    if (!/^[a-z0-9_-]{1,64}$/i.test(key)) {
      return `x.${key}: namespace must match [a-z0-9_-]{1,64}`;
    }
    if (!isPlainObj((x as Record<string, unknown>)[key])) {
      return `x.${key} must be an object`;
    }
  }
  return null;
}

export function validateProfileV1(p: unknown): string | null {
  if (!isPlainObj(p)) return 'profile must be an object';
  if (p.v !== SCHEMA_VERSION) return `profile.v must be ${SCHEMA_VERSION}`;
  if (
    p.handle !== undefined &&
    (!isStr(p.handle) || !HANDLE_RE.test(p.handle))
  ) {
    return 'profile.handle must match [a-z0-9_]{1,32}';
  }
  if (p.displayName !== undefined && !isStr(p.displayName))
    return 'profile.displayName must be string';
  if (p.bio !== undefined && !isStr(p.bio)) return 'profile.bio must be string';
  if (p.avatar !== undefined) {
    const e = validateMedia(p.avatar);
    if (e) return `profile.avatar: ${e}`;
  }
  if (p.banner !== undefined) {
    const e = validateMedia(p.banner);
    if (e) return `profile.banner: ${e}`;
  }
  if (p.links !== undefined) {
    if (!Array.isArray(p.links)) return 'profile.links must be array';
    for (const link of p.links) {
      if (!isPlainObj(link) || !isStr(link.label) || !isStr(link.url)) {
        return 'profile.links[*] must be { label, url }';
      }
    }
  }
  if (p.tags !== undefined) {
    if (!Array.isArray(p.tags) || !p.tags.every(isStr))
      return 'profile.tags must be string[]';
  }
  if (p.lang !== undefined && (!isStr(p.lang) || !BCP47_RE.test(p.lang))) {
    return 'profile.lang must be a BCP-47 tag';
  }
  return validateExtensions(p.x);
}

export function validatePostV1(post: unknown): string | null {
  if (!isPlainObj(post)) return 'post must be an object';
  if (post.v !== SCHEMA_VERSION) return `post.v must be ${SCHEMA_VERSION}`;
  if (!isStr(post.text)) return 'post.text required';
  if (
    post.contentType !== undefined &&
    post.contentType !== 'text' &&
    post.contentType !== 'md'
  ) {
    return 'post.contentType must be "text" or "md"';
  }
  if (
    post.lang !== undefined &&
    (!isStr(post.lang) || !BCP47_RE.test(post.lang))
  ) {
    return 'post.lang must be a BCP-47 tag';
  }
  if (post.media !== undefined) {
    if (!Array.isArray(post.media)) return 'post.media must be array';
    for (const m of post.media) {
      const e = validateMedia(m);
      if (e) return `post.media: ${e}`;
    }
  }
  if (post.mentions !== undefined) {
    if (!Array.isArray(post.mentions) || !post.mentions.every(isStr)) {
      return 'post.mentions must be string[]';
    }
  }
  if (post.hashtags !== undefined) {
    if (
      !Array.isArray(post.hashtags) ||
      !post.hashtags.every((t) => isStr(t) && HASHTAG_RE.test(t))
    ) {
      return 'post.hashtags must be lowercase strings without #';
    }
  }
  if (post.embeds !== undefined) {
    if (!Array.isArray(post.embeds)) return 'post.embeds must be array';
    for (const e of post.embeds) {
      if (!isPlainObj(e) || !isStr(e.kind))
        return 'post.embeds[*].kind required';
      if (e.kind !== 'link' && e.kind !== 'token' && e.kind !== 'poll') {
        return `post.embeds[*].kind unknown: ${e.kind}`;
      }
    }
  }
  if (
    post.parentType !== undefined &&
    post.parentType !== 'post' &&
    post.parentType !== 'comment'
  ) {
    return 'post.parentType must be "post" or "comment"';
  }
  if (
    post.refType !== undefined &&
    !['quote', 'cite', 'embed'].includes(post.refType as string)
  ) {
    return 'post.refType must be "quote" | "cite" | "embed"';
  }
  if (
    post.access !== undefined &&
    !['public', 'private', 'group'].includes(post.access as string)
  ) {
    return 'post.access must be "public" | "private" | "group"';
  }
  if (post.nsfw !== undefined && typeof post.nsfw !== 'boolean') {
    return 'post.nsfw must be boolean';
  }
  if (post.contentWarning !== undefined && !isStr(post.contentWarning)) {
    return 'post.contentWarning must be string';
  }
  if (!isNum(post.timestamp)) return 'post.timestamp required (unix ms)';
  return validateExtensions(post.x);
}

export function validateReactionV1(r: unknown): string | null {
  if (!isPlainObj(r)) return 'reaction must be an object';
  if (r.v !== SCHEMA_VERSION) return `reaction.v must be ${SCHEMA_VERSION}`;
  if (
    !isStr(r.type) ||
    !(REACTION_KINDS as readonly string[]).includes(r.type)
  ) {
    return `reaction.type must be one of ${REACTION_KINDS.join(', ')}`;
  }
  if (r.emoji !== undefined && !isStr(r.emoji))
    return 'reaction.emoji must be string';
  if (!isNum(r.timestamp)) return 'reaction.timestamp required';
  return null;
}

export function validateStandingV1(s: unknown): string | null {
  if (!isPlainObj(s)) return 'standing must be an object';
  if (s.v !== SCHEMA_VERSION) return `standing.v must be ${SCHEMA_VERSION}`;
  if (!isNum(s.since)) return 'standing.since required';
  if (s.note !== undefined && !isStr(s.note))
    return 'standing.note must be string';
  if (s.expiresAt !== undefined && !isNum(s.expiresAt))
    return 'standing.expiresAt must be number';
  return null;
}

export function validateGroupConfigV1(g: unknown): string | null {
  if (!isPlainObj(g)) return 'group config must be an object';
  if (g.v !== SCHEMA_VERSION) return `group.v must be ${SCHEMA_VERSION}`;
  if (!isStr(g.name) || g.name.length === 0) return 'group.name required';
  if (g.description !== undefined && !isStr(g.description))
    return 'group.description must be string';
  if (g.avatar !== undefined) {
    const e = validateMedia(g.avatar);
    if (e) return `group.avatar: ${e}`;
  }
  if (typeof g.isPrivate !== 'boolean')
    return 'group.isPrivate required (boolean)';
  if (g.memberDriven !== undefined && typeof g.memberDriven !== 'boolean') {
    return 'group.memberDriven must be boolean';
  }
  if (
    g.tags !== undefined &&
    (!Array.isArray(g.tags) || !g.tags.every(isStr))
  ) {
    return 'group.tags must be string[]';
  }
  return validateExtensions(g.x);
}

export function assertProfileV1(p: unknown): asserts p is ProfileV1 {
  const e = validateProfileV1(p);
  if (e) throw new Error(`ProfileV1: ${e}`);
}
export function assertPostV1(p: unknown): asserts p is PostV1 {
  const e = validatePostV1(p);
  if (e) throw new Error(`PostV1: ${e}`);
}
export function assertReactionV1(r: unknown): asserts r is ReactionV1 {
  const e = validateReactionV1(r);
  if (e) throw new Error(`ReactionV1: ${e}`);
}
export function assertStandingV1(s: unknown): asserts s is StandingV1 {
  const e = validateStandingV1(s);
  if (e) throw new Error(`StandingV1: ${e}`);
}
export function assertGroupConfigV1(g: unknown): asserts g is GroupConfigV1 {
  const e = validateGroupConfigV1(g);
  if (e) throw new Error(`GroupConfigV1: ${e}`);
}

// ── Constructors (small ergonomic helpers) ─────────────────────────────────

export function profileV1(input: Omit<ProfileV1, 'v'>): ProfileV1 {
  const out: ProfileV1 = { v: SCHEMA_VERSION, ...input };
  assertProfileV1(out);
  return out;
}
export function postV1(
  input: Omit<PostV1, 'v' | 'timestamp'> & { timestamp?: number }
): PostV1 {
  const out: PostV1 = {
    v: SCHEMA_VERSION,
    timestamp: input.timestamp ?? Date.now(),
    ...input,
  };
  // input may also contain timestamp; ensure final value
  if (input.timestamp !== undefined) out.timestamp = input.timestamp;
  assertPostV1(out);
  return out;
}
export function reactionV1(
  input: Omit<ReactionV1, 'v' | 'timestamp'> & { timestamp?: number }
): ReactionV1 {
  const out: ReactionV1 = {
    v: SCHEMA_VERSION,
    timestamp: input.timestamp ?? Date.now(),
    ...input,
  };
  if (input.timestamp !== undefined) out.timestamp = input.timestamp;
  assertReactionV1(out);
  return out;
}
export function standingV1(
  input: Omit<StandingV1, 'v' | 'since'> & { since?: number }
): StandingV1 {
  const out: StandingV1 = {
    v: SCHEMA_VERSION,
    since: input.since ?? Date.now(),
    ...input,
  };
  if (input.since !== undefined) out.since = input.since;
  assertStandingV1(out);
  return out;
}
export function groupConfigV1(input: Omit<GroupConfigV1, 'v'>): GroupConfigV1 {
  const out: GroupConfigV1 = { v: SCHEMA_VERSION, ...input };
  assertGroupConfigV1(out);
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Saves (private bookmarks)
// ───────────────────────────────────────────────────────────────────────────
//
// Personal "save for later" / collection primitive. Distinct from reactions
// (which are public ambient signals): saves are private utility, never
// surfaced as social proof, never aggregated by indexers.
//
// Path: `saved/<contentPath>`.
// ───────────────────────────────────────────────────────────────────────────

export interface SaveV1 {
  v: 1;
  /** Unix milliseconds when saved. */
  timestamp: number;
  /** Optional folder/collection name; free-form, app-defined taxonomy. */
  folder?: string;
  /** Optional private note attached to the save. */
  note?: string;
  x?: Record<string, Record<string, unknown>>;
}

// ───────────────────────────────────────────────────────────────────────────
// Endorsements (weighted directed vouch)
// ───────────────────────────────────────────────────────────────────────────
//
// Stronger / more directional than `standing` (which is a binary follow-style
// signal). An endorsement says "I vouch for this account" with optional topic
// scoping and a 1-5 weight. Apps that want a binary vouch can ignore weight.
//
// Path: `endorsement/<targetAccount>` or `endorsement/<targetAccount>/<topic>`.
// ───────────────────────────────────────────────────────────────────────────

export type EndorsementWeight = 1 | 2 | 3 | 4 | 5;

export interface EndorsementV1 {
  v: 1;
  /** Unix milliseconds when issued. */
  since: number;
  /** Optional topic / skill / domain scope (free string). */
  topic?: string;
  /** 1 (weakest) to 5 (strongest); apps may ignore. */
  weight?: EndorsementWeight;
  /** Optional public note. */
  note?: string;
  /** Optional expiry (unix ms); past this the endorsement is considered stale. */
  expiresAt?: number;
  x?: Record<string, Record<string, unknown>>;
}

// ───────────────────────────────────────────────────────────────────────────
// Attestations (verifiable typed claims)
// ───────────────────────────────────────────────────────────────────────────
//
// Issuer-signed typed claim about a subject (account, content path, or any
// identifier). The path is owned by the issuer, so listing
// `<issuer>/claims/<subject>/<type>` returns every claim that issuer has
// issued about the subject for that type.
//
// Verification is up to the consumer: they decide which issuers to trust.
// `signature` is opaque so any scheme works (ed25519, EIP-712, BLS, …).
//
// Path: `claims/<subject>/<type>/<claimId>`.
// ───────────────────────────────────────────────────────────────────────────

export interface AttestationSignature {
  /** Algorithm hint (e.g. `"ed25519"`, `"secp256k1"`, `"eip712"`). */
  alg: string;
  /** Signature payload (base64 / hex — issuer's choice; alg defines the form). */
  sig: string;
  /** Optional public key / signer hint distinct from the writing account. */
  signer?: string;
}

export interface AttestationV1 {
  v: 1;
  /**
   * Free-string claim type. Lowercase, `[a-z0-9_-]{1,64}`. Examples are
   * domain-specific and intentionally not enumerated here.
   */
  type: string;
  /** Subject identifier (account, content path, or any opaque id). */
  subject: string;
  /** Unix milliseconds when issued. */
  issuedAt: number;
  /** Optional expiry; past this the claim is considered stale. */
  expiresAt?: number;
  /** Optional sub-resource scope (e.g. a SKU, a section, a token id). */
  scope?: string;
  /** Optional pinned evidence (e.g. proof documents, photos). */
  evidence?: MediaRef[];
  /** Free-form metadata; format varies by `type`. */
  metadata?: Record<string, unknown>;
  /** Optional cryptographic signature for off-chain verification. */
  signature?: AttestationSignature;
  x?: Record<string, Record<string, unknown>>;
}

// ── Validators / asserts / constructors ────────────────────────────────────

const CLAIM_TYPE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function validateSaveV1(s: unknown): string | null {
  if (!isPlainObj(s)) return 'save must be an object';
  if (s.v !== SCHEMA_VERSION) return `save.v must be ${SCHEMA_VERSION}`;
  if (!isNum(s.timestamp)) return 'save.timestamp required (unix ms)';
  if (s.folder !== undefined && !isStr(s.folder))
    return 'save.folder must be string';
  if (s.note !== undefined && !isStr(s.note)) return 'save.note must be string';
  return validateExtensions(s.x);
}

export function validateEndorsementV1(e: unknown): string | null {
  if (!isPlainObj(e)) return 'endorsement must be an object';
  if (e.v !== SCHEMA_VERSION) return `endorsement.v must be ${SCHEMA_VERSION}`;
  if (!isNum(e.since)) return 'endorsement.since required (unix ms)';
  if (e.topic !== undefined && !isStr(e.topic))
    return 'endorsement.topic must be string';
  if (e.weight !== undefined) {
    if (!isNum(e.weight) || ![1, 2, 3, 4, 5].includes(e.weight as number)) {
      return 'endorsement.weight must be 1, 2, 3, 4, or 5';
    }
  }
  if (e.note !== undefined && !isStr(e.note))
    return 'endorsement.note must be string';
  if (e.expiresAt !== undefined && !isNum(e.expiresAt)) {
    return 'endorsement.expiresAt must be number';
  }
  return validateExtensions(e.x);
}

function validateAttestationSignature(s: unknown): string | null {
  if (!isPlainObj(s)) return 'signature must be an object';
  if (!isStr(s.alg) || s.alg.length === 0) return 'signature.alg required';
  if (!isStr(s.sig) || s.sig.length === 0) return 'signature.sig required';
  if (s.signer !== undefined && !isStr(s.signer))
    return 'signature.signer must be string';
  return null;
}

export function validateAttestationV1(a: unknown): string | null {
  if (!isPlainObj(a)) return 'attestation must be an object';
  if (a.v !== SCHEMA_VERSION) return `attestation.v must be ${SCHEMA_VERSION}`;
  if (!isStr(a.type) || !CLAIM_TYPE_RE.test(a.type)) {
    return 'attestation.type must match [a-z0-9][a-z0-9_-]{0,63}';
  }
  if (!isStr(a.subject) || a.subject.length === 0)
    return 'attestation.subject required';
  if (!isNum(a.issuedAt)) return 'attestation.issuedAt required (unix ms)';
  if (a.expiresAt !== undefined && !isNum(a.expiresAt)) {
    return 'attestation.expiresAt must be number';
  }
  if (a.scope !== undefined && !isStr(a.scope))
    return 'attestation.scope must be string';
  if (a.evidence !== undefined) {
    if (!Array.isArray(a.evidence)) return 'attestation.evidence must be array';
    for (const m of a.evidence) {
      const e = validateMedia(m);
      if (e) return `attestation.evidence: ${e}`;
    }
  }
  if (a.metadata !== undefined && !isPlainObj(a.metadata)) {
    return 'attestation.metadata must be an object';
  }
  if (a.signature !== undefined) {
    const e = validateAttestationSignature(a.signature);
    if (e) return `attestation.signature: ${e}`;
  }
  return validateExtensions(a.x);
}

export function assertSaveV1(s: unknown): asserts s is SaveV1 {
  const e = validateSaveV1(s);
  if (e) throw new Error(`SaveV1: ${e}`);
}
export function assertEndorsementV1(e: unknown): asserts e is EndorsementV1 {
  const err = validateEndorsementV1(e);
  if (err) throw new Error(`EndorsementV1: ${err}`);
}
export function assertAttestationV1(a: unknown): asserts a is AttestationV1 {
  const e = validateAttestationV1(a);
  if (e) throw new Error(`AttestationV1: ${e}`);
}

export function saveV1(
  input: Omit<SaveV1, 'v' | 'timestamp'> & { timestamp?: number }
): SaveV1 {
  const out: SaveV1 = {
    v: SCHEMA_VERSION,
    timestamp: input.timestamp ?? Date.now(),
    ...input,
  };
  if (input.timestamp !== undefined) out.timestamp = input.timestamp;
  assertSaveV1(out);
  return out;
}

export function endorsementV1(
  input: Omit<EndorsementV1, 'v' | 'since'> & { since?: number }
): EndorsementV1 {
  const out: EndorsementV1 = {
    v: SCHEMA_VERSION,
    since: input.since ?? Date.now(),
    ...input,
  };
  if (input.since !== undefined) out.since = input.since;
  assertEndorsementV1(out);
  return out;
}

export function attestationV1(
  input: Omit<AttestationV1, 'v' | 'issuedAt'> & { issuedAt?: number }
): AttestationV1 {
  const out: AttestationV1 = {
    v: SCHEMA_VERSION,
    issuedAt: input.issuedAt ?? Date.now(),
    ...input,
  };
  if (input.issuedAt !== undefined) out.issuedAt = input.issuedAt;
  assertAttestationV1(out);
  return out;
}
