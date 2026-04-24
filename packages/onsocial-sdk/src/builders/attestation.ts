// ---------------------------------------------------------------------------
// builders/attestation — verifiable typed claim payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { MediaRef } from '../schema/v1.js';
import type { SocialSetData } from './_shared.js';

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
