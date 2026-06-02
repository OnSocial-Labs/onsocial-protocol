// ---------------------------------------------------------------------------
// OnSocial SDK — endorsements module
//
// The single, blessed entry point for directed contextual vouches between
// accounts. Wraps `os.social.endorse` / `unendorse` / `getEndorsement`
// for writes + `os.query.endorsements.given` / `received`
// for materialised reads:
//
//   await os.endorsements.add('bob.near', { topic: 'rust', note: 'Shipped cleanly.' });
//   await os.endorsements.upsert('bob.near', { topic: 'design' }, { previousTopic: 'rust' });
//   await os.endorsements.remove('bob.near', { topic: 'rust' });
//   const { applied } = await os.endorsements.toggle('bob.near');
//   const got = await os.endorsements.get('bob.near');
//   const out = await os.endorsements.listGiven('alice.near');
//   const inb = await os.endorsements.listReceived('bob.near');
//
// Endorsements are public records — anyone can read them. Writes default
// to the JWT identity; reads default the issuer to the JWT identity when
// not explicitly provided.
// ---------------------------------------------------------------------------

import { normalizeEndorsementTopic } from '../builders/endorsement.js';
import type { SocialModule, EndorsementBuildInput } from './social.js';
import type { QueryModule } from '../query/index.js';
import type { EndorsementRecord, RelayResponse } from '../types.js';

/** Raised when moving an endorsement to a topic slot that already exists. */
export class EndorsementTopicConflictError extends Error {
  readonly code = 'ENDORSEMENT_TOPIC_CONFLICT';

  constructor(
    public readonly target: string,
    public readonly topic: string
  ) {
    super(
      `You already endorsed ${target} for ${topic}. Edit that endorsement instead.`
    );
    this.name = 'EndorsementTopicConflictError';
  }
}

export interface EndorsementListItem extends EndorsementRecord {
  issuer: string;
  blockHeight: number;
  blockTimestamp: number;
}

function parseEndorsementValue(
  raw: string,
  issuer: string,
  target: string
): EndorsementListItem {
  let parsed: Record<string, unknown> = {};
  try {
    parsed =
      typeof raw === 'string' && raw.length > 0
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {};
  } catch {
    parsed = {};
  }
  return {
    issuer,
    target,
    v: typeof parsed.v === 'number' ? parsed.v : 1,
    since: typeof parsed.since === 'number' ? parsed.since : 0,
    ...(parsed as Omit<EndorsementRecord, 'target' | 'v' | 'since'>),
    blockHeight: 0,
    blockTimestamp: 0,
  };
}

/**
 * Endorsements (`add` / `remove` / `toggle` / `get` / `listGiven` / `listReceived`).
 *
 * @throws {SessionRequiredError} On writes when no session is attached and broadcast is not `'wallet'`.
 */
export class EndorsementsModule {
  constructor(
    private _social: SocialModule,
    private _query: QueryModule
  ) {}

  /**
   * Endorse another account. Idempotent — re-endorsing overwrites.
   *
   * ```ts
   * await os.endorsements.add('bob.near');
   * await os.endorsements.add('bob.near', {
   *   topic: 'rust',
   *   note: 'Shipped cleanly under load.',
   * });
   * ```
   */
  add(
    target: string,
    input?: EndorsementBuildInput,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return opts
      ? this._social.endorse(target, input, opts)
      : this._social.endorse(target, input);
  }

  /**
   * Remove an endorsement. Optional `topic` matches the topic used at add-time.
   *
   * ```ts
   * await os.endorsements.remove('bob.near');
   * await os.endorsements.remove('bob.near', { topic: 'rust' });
   * ```
   */
  remove(
    target: string,
    opts: { topic?: string; wait?: boolean } = {}
  ): Promise<RelayResponse> {
    return opts.wait != null
      ? this._social.unendorse(target, opts.topic, { wait: opts.wait })
      : this._social.unendorse(target, opts.topic);
  }

  /**
   * Add or update an endorsement. When `previousTopic` is supplied and the
   * normalized topic changes, the prior path is withdrawn before writing the
   * new one (move semantics). Re-endorsing the same topic overwrites in place.
   *
   * @throws {EndorsementTopicConflictError} When the topic changes to a slot
   *   that already has an endorsement from the caller.
   */
  async upsert(
    target: string,
    input: EndorsementBuildInput = {},
    opts: { previousTopic?: string; wait?: boolean } = {}
  ): Promise<RelayResponse> {
    const newTopic = normalizeEndorsementTopic(input.topic);
    const prevTopic = normalizeEndorsementTopic(opts.previousTopic);
    const topicMoved =
      opts.previousTopic !== undefined && prevTopic !== newTopic;

    if (topicMoved) {
      const existingAtNew = newTopic
        ? await this._social.getEndorsement(target, { topic: newTopic })
        : await this._social.getEndorsement(target);
      if (existingAtNew) {
        throw new EndorsementTopicConflictError(target, newTopic ?? 'general');
      }

      if (opts.wait) {
        await this._social.unendorse(target, opts.previousTopic, {
          wait: true,
        });
        return this._social.endorse(target, input, { wait: true });
      }
      await this._social.unendorse(target, opts.previousTopic);
      return this._social.endorse(target, input);
    }

    return opts.wait != null
      ? this.add(target, input, { wait: opts.wait })
      : this.add(target, input);
  }

  /**
   * Toggle the caller's endorsement of `target`. If an endorsement exists
   * (under the JWT identity), it is removed; otherwise it is set with the
   * provided input. Returns `{ response, applied }` where `applied=true`
   * means an endorsement now exists.
   *
   * ```ts
   * const { applied } = await os.endorsements.toggle('bob.near', {
   *   topic: 'rust',
   *   note: 'Shipped cleanly under load.',
   * });
   * setEndorsed(applied);
   * ```
   */
  async toggle(
    target: string,
    input: EndorsementBuildInput = {},
    opts?: { wait?: boolean }
  ): Promise<{ response: RelayResponse; applied: boolean }> {
    const existing = await this._social.getEndorsement(target, {
      topic: input.topic,
    });
    if (existing) {
      const response = opts
        ? await this._social.unendorse(target, input.topic, opts)
        : await this._social.unendorse(target, input.topic);
      return { response, applied: false };
    }
    const response = opts
      ? await this._social.endorse(target, input, opts)
      : await this._social.endorse(target, input);
    return { response, applied: true };
  }

  /**
   * Read a single endorsement. Defaults the issuer to the JWT identity.
   *
   * ```ts
   * const e = await os.endorsements.get('bob.near');
   * const e2 = await os.endorsements.get('bob.near', {
   *   issuer: 'alice.near', topic: 'rust',
   * });
   * ```
   */
  get(
    target: string,
    opts: { issuer?: string; topic?: string } = {}
  ): Promise<EndorsementRecord | null> {
    return this._social.getEndorsement(target, {
      topic: opts.topic,
      accountId: opts.issuer,
    });
  }

  /**
   * List endorsements an issuer has given out. Returns materialised rows
   * with the body already parsed.
   *
   * ```ts
   * const out = await os.endorsements.listGiven('alice.near', { limit: 50 });
   * ```
   */
  async listGiven(
    issuer: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<EndorsementListItem[]> {
    const rows = await this._query.endorsements.given(issuer, opts);
    return rows.map((r) => ({
      ...parseEndorsementValue(r.value, r.issuer, r.target),
      blockHeight: r.blockHeight,
      blockTimestamp: r.blockTimestamp,
    }));
  }

  /**
   * List endorsements a target has received. Returns materialised rows
   * with the body already parsed.
   *
   * ```ts
   * const inb = await os.endorsements.listReceived('bob.near');
   * ```
   */
  async listReceived(
    target: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<EndorsementListItem[]> {
    const rows = await this._query.endorsements.received(target, opts);
    return rows.map((r) => ({
      ...parseEndorsementValue(r.value, r.issuer, r.target),
      blockHeight: r.blockHeight,
      blockTimestamp: r.blockTimestamp,
    }));
  }
}
