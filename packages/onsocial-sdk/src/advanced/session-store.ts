import type { Network } from '../types.js';

export type StoredSessionContract = 'core' | 'scarces' | 'rewards' | 'token';

/** Serialized session metadata. */
export interface StoredSession {
  v: 2;
  accountId: string;
  contract: StoredSessionContract;
  contractId: string;
  network: Network;
  publicKey: string;
  secretSeedB64u: string;
  path?: string;
  lastNonce: number;
  expiresAtMs?: number;
}

export interface KeyStore {
  get(id: string): Promise<StoredSession | null>;
  set(id: string, value: StoredSession): Promise<void>;
  delete(id: string): Promise<void>;
}
