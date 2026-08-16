'use client';

import type { NearWalletBase } from '@hot-labs/near-connect';
import type { Session } from '@onsocial/sdk/advanced';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { BROWSER_GATEWAY_PROXY } from '@/lib/app-gateway-url';
import {
  base64ToBytes,
  bytesToBase64,
  hashNep413Payload,
} from '@/lib/app-nep413';

const STORAGE_PREFIX = 'onsocial.app.gateway.jwt.';

type CachedGatewayJwt = {
  accountId: string;
  token: string;
};

export type EnsureAppGatewayAuthInput = {
  accountId: string;
  wallet: NearWalletBase;
  /** Prefer silent NEP-413 with this key; wallet only as fallback. */
  session?: Session | null;
  /**
   * When false, never open a wallet sign prompt (bootstrap / best-effort).
   * Defaults to true for explicit user actions like Mute.
   */
  allowWalletFallback?: boolean;
};

let memoryCache: CachedGatewayJwt | null = null;
/** In-flight auth promises keyed by account — never share across wallets. */
const authPromises = new Map<string, Promise<string>>();

function decodePayload(
  token: string
): { exp?: number; accountId?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]!)) as {
      exp?: number;
      accountId?: string;
    };
  } catch {
    return null;
  }
}

function isTokenValidForAccount(token: string, accountId: string): boolean {
  const payload = decodePayload(token);
  if (!payload?.exp || !payload.accountId) return false;
  if (payload.accountId.toLowerCase() !== accountId.toLowerCase()) return false;
  // 2-minute safety margin before expiry.
  return payload.exp * 1000 > Date.now() + 2 * 60 * 1000;
}

function storageKey(accountId: string): string {
  return `${STORAGE_PREFIX}${accountId.toLowerCase()}`;
}

function readStoredToken(accountId: string): string | null {
  try {
    const token = window.sessionStorage.getItem(storageKey(accountId));
    if (token && isTokenValidForAccount(token, accountId)) return token;
  } catch {
    // ignore
  }
  return null;
}

function writeStoredToken(accountId: string, token: string): void {
  memoryCache = { accountId, token };
  try {
    window.sessionStorage.setItem(storageKey(accountId), token);
  } catch {
    // ignore
  }
}

export function clearAppGatewayAuth(accountId?: string | null): void {
  if (!accountId) {
    memoryCache = null;
    authPromises.clear();
    return;
  }
  const id = accountId.trim().toLowerCase();
  if (memoryCache?.accountId.toLowerCase() === id) {
    memoryCache = null;
  }
  authPromises.delete(id);
  try {
    window.sessionStorage.removeItem(storageKey(accountId));
  } catch {
    // ignore
  }
}

type AuthChallenge = {
  message: string;
  recipient: string;
  nonce: string;
};

async function fetchAuthChallenge(accountId: string): Promise<AuthChallenge> {
  const challengeRes = await fetch(`${BROWSER_GATEWAY_PROXY}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  if (!challengeRes.ok) {
    const body = (await challengeRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? 'Failed to get auth challenge');
  }

  const { challenge } = (await challengeRes.json()) as {
    challenge: AuthChallenge;
  };
  return challenge;
}

async function exchangeLogin(input: {
  accountId: string;
  message: string;
  signature: string;
  publicKey: string;
}): Promise<string> {
  const loginRes = await fetch(`${BROWSER_GATEWAY_PROXY}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!loginRes.ok) {
    const body = (await loginRes.json().catch(() => ({}))) as {
      error?: string;
      details?: string;
    };
    const msg = body.error ?? `Login failed (${loginRes.status})`;
    throw new Error(body.details ? `${msg}: ${body.details}` : msg);
  }

  const data = (await loginRes.json()) as { token?: string };
  if (!data.token) {
    throw new Error('Login failed: missing token');
  }
  return data.token;
}

/** Silent path: sign the challenge with the social session key (no wallet UI). */
async function loginWithSessionKey(
  session: Session,
  accountId: string
): Promise<string> {
  const challenge = await fetchAuthChallenge(accountId);
  const nonce = base64ToBytes(challenge.nonce);
  const digest = await hashNep413Payload({
    message: challenge.message,
    nonce,
    recipient: challenge.recipient,
  });
  const signatureBytes = await session.key.sign(digest);
  return exchangeLogin({
    accountId,
    message: challenge.message,
    signature: bytesToBase64(signatureBytes),
    publicKey: session.key.publicKey,
  });
}

async function loginWithWallet(
  wallet: NearWalletBase,
  accountId: string
): Promise<string> {
  if (typeof wallet.signMessage !== 'function') {
    throw new Error('Wallet does not support message signing');
  }

  const challenge = await fetchAuthChallenge(accountId);
  const signed = await wallet.signMessage({
    network: ACTIVE_NEAR_NETWORK,
    signerId: accountId,
    message: challenge.message,
    recipient: challenge.recipient,
    nonce: base64ToBytes(challenge.nonce),
  });

  return exchangeLogin({
    accountId: signed.accountId,
    message: challenge.message,
    signature: signed.signature,
    publicKey: signed.publicKey,
  });
}

/** Cached viewer JWT when still valid — no sign prompt. */
export function getCachedAppGatewayAuth(accountId: string): string | null {
  if (
    memoryCache?.accountId.toLowerCase() === accountId.toLowerCase() &&
    memoryCache.token &&
    isTokenValidForAccount(memoryCache.token, accountId)
  ) {
    return memoryCache.token;
  }
  const stored = readStoredToken(accountId);
  if (stored) {
    memoryCache = { accountId, token: stored };
    return stored;
  }
  return null;
}

/**
 * Ensure a viewer JWT for private gateway prefs (mutes / DMs).
 * Prefers silent session-key NEP-413; wallet signMessage only as fallback.
 * In-flight auth is account-scoped so wallet switches cannot share a JWT.
 */
export async function ensureAppGatewayAuth(
  input: EnsureAppGatewayAuthInput
): Promise<string> {
  const { accountId, wallet, session, allowWalletFallback = true } = input;
  const id = accountId.trim().toLowerCase();
  const cached = getCachedAppGatewayAuth(id);
  if (cached) return cached;

  const existing = authPromises.get(id);
  if (existing) return existing;

  const promise = (async () => {
    if (session?.key?.sign && session.key.publicKey) {
      try {
        const token = await loginWithSessionKey(session, id);
        if (!isTokenValidForAccount(token, id)) {
          throw new Error('Gateway token account mismatch after session login.');
        }
        writeStoredToken(id, token);
        return token;
      } catch (error) {
        if (!allowWalletFallback) throw error;
        console.warn(
          'Silent gateway auth via social session failed; falling back to wallet',
          error
        );
      }
    }

    if (!allowWalletFallback) {
      throw new Error('Gateway auth requires a social session.');
    }

    const token = await loginWithWallet(wallet, id);
    if (!isTokenValidForAccount(token, id)) {
      throw new Error('Gateway token account mismatch after wallet login.');
    }
    writeStoredToken(id, token);
    return token;
  })().finally(() => {
    if (authPromises.get(id) === promise) {
      authPromises.delete(id);
    }
  });

  authPromises.set(id, promise);
  return promise;
}
