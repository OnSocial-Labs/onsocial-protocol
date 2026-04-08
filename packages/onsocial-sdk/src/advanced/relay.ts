// ---------------------------------------------------------------------------
// OnSocial SDK — advanced/relay
//
// Direct relayer integration for signed-payload and delegate-action auth.
// Bypasses the gateway — talks to the relayer directly.
// ---------------------------------------------------------------------------

import type { RelayResponse } from '../types.js';
import type { Action } from './actions.js';
import { buildSigningMessage, buildSigningPayload } from './signing.js';
import type { SigningPayloadInput } from './signing.js';

export interface RelayerConfig {
  /** Relayer base URL (e.g. https://relay.onsocial.id). */
  relayerUrl: string;
  /** Custom fetch implementation (default: globalThis.fetch). */
  fetch?: typeof globalThis.fetch;
}

export interface SignedRequest {
  targetAccount: string;
  action: Action;
  publicKey: string;
  nonce: number;
  expiresAtMs: number;
  /** Base64 ed25519 signature over the signing message. */
  signature: string;
}

/**
 * Direct relayer client for advanced use cases.
 *
 * ```ts
 * import { DirectRelay, buildSigningMessage, buildSigningPayload } from '@onsocial/sdk/advanced';
 *
 * const relay = new DirectRelay({ relayerUrl: 'https://relay.onsocial.id' });
 * const payload = buildSigningPayload({ ... });
 * const message = buildSigningMessage('core.onsocial.near', payload);
 * const signature = await wallet.signMessage(message);
 * const result = await relay.executeSigned({ ... });
 * ```
 */
export class DirectRelay {
  private _baseUrl: string;
  private _fetch: typeof globalThis.fetch;

  constructor(config: RelayerConfig) {
    this._baseUrl = config.relayerUrl.replace(/\/$/, '');
    this._fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Submit a signed request directly to the relayer. */
  async executeSigned(req: SignedRequest): Promise<RelayResponse> {
    const body = {
      target_account: req.targetAccount,
      action: req.action,
      auth: {
        type: 'signed_payload',
        actor_id: req.targetAccount, // actor is the signer
        public_key: req.publicKey,
        nonce: String(req.nonce),
        expires_at_ms: String(req.expiresAtMs),
        signature: req.signature,
      },
    };

    const res = await this._fetch(`${this._baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error ?? `Relayer returned ${res.status}`);
    }

    return res.json() as Promise<RelayResponse>;
  }

  /** Check relayer health. */
  async health(): Promise<Record<string, unknown>> {
    const res = await this._fetch(`${this._baseUrl}/health`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  // Re-export signing helpers for convenience
  static buildSigningPayload = buildSigningPayload;
  static buildSigningMessage = buildSigningMessage;
}

export type { SigningPayloadInput };
