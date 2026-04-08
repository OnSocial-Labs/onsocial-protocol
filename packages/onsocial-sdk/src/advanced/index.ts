// ---------------------------------------------------------------------------
// @onsocial/sdk/advanced — power-user exports
//
// Signing, typed actions, direct relayer, and contract IDs.
// ---------------------------------------------------------------------------

// Signing
export {
  DOMAIN_PREFIX,
  canonicalize,
  buildSigningPayload,
  buildSigningMessage,
} from './signing.js';
export type { SigningPayloadInput } from './signing.js';

// Typed actions
export type {
  Action,
  CoreAction,
  ScarcesAction,
  RewardsAction,
  TokenMetadata,
  AllowlistEntry,
} from './actions.js';
export { CONTRACTS } from './actions.js';

// Direct relayer
export { DirectRelay } from './relay.js';
export type { RelayerConfig, SignedRequest } from './relay.js';
