import type { Request } from 'express';

export type Tier = 'free' | 'pro' | 'scale';

export type AuthMethod = 'jwt' | 'apikey';

export interface TierInfo {
  tier: Tier;
  rateLimit: number;
}

export interface JwtPayload {
  accountId: string;
  tier: Tier;
  /** How the request was authenticated */
  method?: AuthMethod;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  auth?: JwtPayload;
}

// ---------------------------------------------------------------------------
// Contract auth types — how the smart contract verifies the caller
//
//   JWT (user has key) ──→ SignedPayload  (user proves intent per-action)
//   API Key (server)   ──→ Intent         (whitelisted relayer acts on behalf)
//   AI Agent token     ──→ Intent         (whitelisted relayer acts on behalf)
//
// The caller doesn't choose — the auth method on the request determines
// the trust model automatically.
// ---------------------------------------------------------------------------

/** Intent auth — relayer is whitelisted as an intents_executor on the contract. */
export interface IntentAuth {
  type: 'intent';
  actor_id: string;
  intent: Record<string, unknown>;
}

/** Signed payload auth — user signs the action off-chain with their NEAR key. */
export interface SignedPayloadAuth {
  type: 'signed_payload';
  actor_id: string;
  public_key: string;
  nonce: string;
  expires_at_ms: string;
  signature: string;
}

/** Delegate action auth — NEP-366 meta-transaction (pro tier). */
export interface DelegateActionAuth {
  type: 'delegate_action';
  actor_id: string;
  delegate_action: Record<string, unknown>;
}

/** Union of all contract auth modes. */
export type ContractAuth = IntentAuth | SignedPayloadAuth | DelegateActionAuth;
