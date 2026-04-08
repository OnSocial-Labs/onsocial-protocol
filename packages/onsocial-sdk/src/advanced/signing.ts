// ---------------------------------------------------------------------------
// OnSocial SDK — advanced/signing
//
// TypeScript port of crates/onsocial-types (canonicalize + build_signing_*).
// Zero external dependencies.
// ---------------------------------------------------------------------------

/** Domain prefix used by all OnSocial contracts. */
export const DOMAIN_PREFIX = 'onsocial:execute:v1';

// ── Canonical JSON ──────────────────────────────────────────────────────────

/** Recursively sort object keys for deterministic serialization. */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value; // primitives
}

// ── Payload construction ────────────────────────────────────────────────────

export interface SigningPayloadInput {
  targetAccount: string;
  publicKey: string;
  nonce: number | string;
  expiresAtMs: number | string;
  action: Record<string, unknown>;
  delegateAction?: Record<string, unknown>;
}

/**
 * Build the signing payload object (matches Rust `build_signing_payload`).
 *
 * Field order and types must match exactly for signature verification:
 * - nonce and expires_at_ms are serialized as strings
 * - action is canonicalized (keys sorted recursively)
 */
export function buildSigningPayload(input: SigningPayloadInput): Record<string, unknown> {
  return {
    target_account: input.targetAccount,
    public_key: input.publicKey,
    nonce: String(input.nonce),
    expires_at_ms: String(input.expiresAtMs),
    action: canonicalize(input.action),
    delegate_action: input.delegateAction
      ? canonicalize(input.delegateAction)
      : null,
  };
}

/**
 * Build the full signing message bytes.
 *
 * Format: `{DOMAIN_PREFIX}:{contractId}\0{payload_json}`
 *
 * The returned Uint8Array is what must be signed with ed25519.
 *
 * ```ts
 * const msg = buildSigningMessage('core.onsocial.near', payload);
 * const signature = await wallet.signMessage(msg);
 * ```
 */
export function buildSigningMessage(
  contractId: string,
  payload: Record<string, unknown>,
): Uint8Array {
  const domain = `${DOMAIN_PREFIX}:${contractId}`;
  const payloadJson = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const domainBytes = encoder.encode(domain);
  const payloadBytes = encoder.encode(payloadJson);

  const message = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
  message.set(domainBytes);
  message[domainBytes.length] = 0; // null separator
  message.set(payloadBytes, domainBytes.length + 1);

  return message;
}
