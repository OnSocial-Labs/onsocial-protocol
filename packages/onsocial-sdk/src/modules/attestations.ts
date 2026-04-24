// ---------------------------------------------------------------------------
// OnSocial SDK — attestations module
//
// The single, blessed entry point for issuing verifiable typed claims.
// Wraps `os.social.attest` / `revokeAttestation` / `getAttestation` for
// writes + `os.query.attestations.issued` / `about` for materialised
// reads. Auto-generates a `claimId` when the caller doesn't supply one:
//
//   const { claimId } = await os.attestations.issue({
//     type: 'skill',
//     subject: 'bob.near',
//     scope: 'rust',
//   });
//   await os.attestations.revoke('bob.near', 'skill', claimId);
//   const claim = await os.attestations.get('bob.near', 'skill', claimId);
//   const issued = await os.attestations.listIssued('alice.near');
//   const about  = await os.attestations.listAbout('bob.near');
//
// Attestations are public records — anyone can read them. Writes default
// to the JWT identity; reads default the issuer to the JWT identity when
// not explicitly provided.
// ---------------------------------------------------------------------------

import type { SocialModule, AttestationBuildInput } from '../social.js';
import type { QueryModule } from '../query/index.js';
import type { AttestationRecord, RelayResponse } from '../types.js';

export interface AttestationListItem extends AttestationRecord {
  issuer: string;
  blockHeight: number;
  blockTimestamp: number;
}

function generateClaimId(): string {
  // Globally unique enough for a single issuer's namespace; collisions
  // overwrite, which matches our "set" semantics.
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis.crypto as Crypto | undefined)?.randomUUID === 'function'
  ) {
    return (globalThis.crypto as Crypto).randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseAttestationValue(
  raw: string,
  issuer: string,
  subject: string,
  claimType: string,
  claimId: string
): AttestationListItem {
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
    claimId,
    type: claimType,
    subject,
    v: typeof parsed.v === 'number' ? parsed.v : 1,
    issuedAt: typeof parsed.issuedAt === 'number' ? parsed.issuedAt : 0,
    ...(parsed as Omit<
      AttestationRecord,
      'claimId' | 'type' | 'subject' | 'v' | 'issuedAt'
    >),
    blockHeight: 0,
    blockTimestamp: 0,
  };
}

export class AttestationsModule {
  constructor(
    private _social: SocialModule,
    private _query: QueryModule
  ) {}

  /**
   * Issue a new attestation. Auto-generates a stable `claimId` when one
   * isn't provided. Returns both the relay response and the resolved
   * `claimId` so callers can revoke / link to the claim later.
   *
   * ```ts
   * const { claimId } = await os.attestations.issue({
   *   type: 'skill',
   *   subject: 'bob.near',
   *   scope: 'rust',
   * });
   * ```
   *
   * Pass `claimId` explicitly to make the write idempotent (re-issuing
   * with the same id overwrites):
   *
   * ```ts
   * await os.attestations.issue(
   *   { type: 'skill', subject: 'bob.near' },
   *   { claimId: 'rust-2026' }
   * );
   * ```
   */
  async issue(
    input: AttestationBuildInput,
    opts: { claimId?: string } = {}
  ): Promise<{ response: RelayResponse; claimId: string }> {
    const claimId = opts.claimId ?? generateClaimId();
    const response = await this._social.attest(claimId, input);
    return { response, claimId };
  }

  /**
   * Revoke an attestation by its full coordinates.
   *
   * ```ts
   * await os.attestations.revoke('bob.near', 'skill', 'rust-2026');
   * ```
   */
  revoke(
    subject: string,
    type: string,
    claimId: string
  ): Promise<RelayResponse> {
    return this._social.revokeAttestation(subject, type, claimId);
  }

  /**
   * Read a single attestation. Defaults the issuer to the JWT identity.
   *
   * ```ts
   * const c = await os.attestations.get('bob.near', 'skill', 'rust-2026');
   * const c2 = await os.attestations.get(
   *   'bob.near', 'skill', 'rust-2026',
   *   { issuer: 'alice.near' }
   * );
   * ```
   */
  get(
    subject: string,
    type: string,
    claimId: string,
    opts: { issuer?: string } = {}
  ): Promise<AttestationRecord | null> {
    return this._social.getAttestation(subject, type, claimId, opts.issuer);
  }

  /**
   * List attestations issued by an account. Returns materialised rows
   * with the body already parsed. Optionally filter by `type`.
   *
   * ```ts
   * const claims = await os.attestations.listIssued('alice.near', {
   *   type: 'skill', limit: 25,
   * });
   * ```
   */
  async listIssued(
    issuer: string,
    opts: { type?: string; limit?: number; offset?: number } = {}
  ): Promise<AttestationListItem[]> {
    const rows = await this._query.attestations.issued(issuer, {
      ...(opts.type ? { claimType: opts.type } : {}),
      ...(opts.limit != null ? { limit: opts.limit } : {}),
      ...(opts.offset != null ? { offset: opts.offset } : {}),
    });
    return rows.map((r) => ({
      ...parseAttestationValue(
        r.value,
        r.issuer,
        r.subject,
        r.claimType,
        r.claimId
      ),
      blockHeight: r.blockHeight,
      blockTimestamp: r.blockTimestamp,
    }));
  }

  /**
   * List attestations about a subject. Optionally filter by `type`.
   *
   * ```ts
   * const claims = await os.attestations.listAbout('bob.near', {
   *   type: 'skill',
   * });
   * ```
   */
  async listAbout(
    subject: string,
    opts: { type?: string; limit?: number; offset?: number } = {}
  ): Promise<AttestationListItem[]> {
    const rows = await this._query.attestations.about(subject, {
      ...(opts.type ? { claimType: opts.type } : {}),
      ...(opts.limit != null ? { limit: opts.limit } : {}),
      ...(opts.offset != null ? { offset: opts.offset } : {}),
    });
    return rows.map((r) => ({
      ...parseAttestationValue(
        r.value,
        r.issuer,
        r.subject,
        r.claimType,
        r.claimId
      ),
      blockHeight: r.blockHeight,
      blockTimestamp: r.blockTimestamp,
    }));
  }
}
