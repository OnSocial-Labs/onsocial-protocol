// ---------------------------------------------------------------------------
// OnSocial SDK — endorsements module
//
// The single, blessed entry point for weighted directed vouches between
// accounts. Wraps `os.social.endorse` / `unendorse` / `getEndorsement`
// for writes + `os.query.endorsements.given` / `received`
// for materialised reads:
//
//   await os.endorsements.add('bob.near', { topic: 'rust', weight: 5 });
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

import type { SocialModule, EndorsementBuildInput } from '../social.js';
import type { QueryModule } from '../query/index.js';
import type { EndorsementRecord, RelayResponse } from '../types.js';

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
   * await os.endorsements.add('bob.near', { topic: 'rust', weight: 5 });
   * ```
   */
  add(target: string, input?: EndorsementBuildInput): Promise<RelayResponse> {
    return this._social.endorse(target, input);
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
    opts: { topic?: string } = {}
  ): Promise<RelayResponse> {
    return this._social.unendorse(target, opts.topic);
  }

  /**
   * Toggle the caller's endorsement of `target`. If an endorsement exists
   * (under the JWT identity), it is removed; otherwise it is set with the
   * provided input. Returns `{ response, applied }` where `applied=true`
   * means an endorsement now exists.
   *
   * ```ts
   * const { applied } = await os.endorsements.toggle('bob.near', {
   *   topic: 'rust', weight: 5,
   * });
   * setEndorsed(applied);
   * ```
   */
  async toggle(
    target: string,
    input: EndorsementBuildInput = {}
  ): Promise<{ response: RelayResponse; applied: boolean }> {
    const existing = await this._social.getEndorsement(target, {
      topic: input.topic,
    });
    if (existing) {
      const response = await this._social.unendorse(target, input.topic);
      return { response, applied: false };
    }
    const response = await this._social.endorse(target, input);
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
