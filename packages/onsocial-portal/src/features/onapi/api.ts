import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_API_URL, ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';

const GATEWAY_BASE = ACTIVE_API_URL.replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────

export interface ApiKeyInfo {
  prefix: string;
  label: string;
  tier: string;
  createdAt: string;
}

export interface CreateKeyResult {
  key: string;
  prefix: string;
  label: string;
  tier: string;
}

export interface UsageSummary {
  today: number;
  thisMonth: number;
  byEndpoint?: Record<string, number>;
}

// ── Gateway Auth ──────────────────────────────────────────────

function decodeBase64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/**
 * Authenticate with the gateway via server-issued challenge + NEAR wallet signature.
 * Same pattern as the Social Key flow (proven to work).
 *
 * 1. POST /auth/challenge → { challenge: { message, recipient, nonce } }
 * 2. wallet.signMessage(challenge)
 * 3. POST /auth/login with signed message → JWT
 */
export async function gatewayLogin(
  wallet: NearWalletBase,
  accountId: string,
): Promise<string> {
  if (typeof wallet.signMessage !== 'function') {
    throw new Error('Wallet does not support message signing');
  }

  // Step 1: Request challenge from gateway
  const challengeRes = await fetch(`${GATEWAY_BASE}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });

  if (!challengeRes.ok) {
    const body = await challengeRes.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? 'Failed to get auth challenge',
    );
  }

  const { challenge } = (await challengeRes.json()) as {
    challenge: { message: string; recipient: string; nonce: string };
  };

  // Step 2: Sign the challenge with wallet (NEP-413)
  const signed = await wallet.signMessage({
    network: ACTIVE_NEAR_NETWORK,
    signerId: accountId,
    message: challenge.message,
    recipient: challenge.recipient,
    nonce: decodeBase64ToBytes(challenge.nonce),
  });

  // Step 3: Send signed message to gateway for verification
  const res = await fetch(`${GATEWAY_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: signed.accountId,
      message: challenge.message,
      signature: signed.signature,
      publicKey: signed.publicKey,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = (body as { details?: string }).details;
    const msg =
      (body as { error?: string }).error ?? `Login failed (${res.status})`;
    throw new Error(detail ? `${msg}: ${detail}` : msg);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

// ── Key Management (requires JWT) ─────────────────────────────

export async function createApiKey(
  jwt: string,
  label: string,
): Promise<CreateKeyResult> {
  const res = await fetch(`${GATEWAY_BASE}/developer/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ label }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Failed to create key (${res.status})`,
    );
  }

  return (await res.json()) as CreateKeyResult;
}

export async function listApiKeys(jwt: string): Promise<ApiKeyInfo[]> {
  const res = await fetch(`${GATEWAY_BASE}/developer/keys`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (!res.ok) throw new Error('Failed to list keys');

  const data = (await res.json()) as { keys: ApiKeyInfo[] };
  return data.keys;
}

export async function revokeApiKey(
  jwt: string,
  prefix: string,
): Promise<void> {
  const res = await fetch(
    `${GATEWAY_BASE}/developer/keys/${encodeURIComponent(prefix)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? 'Failed to revoke key',
    );
  }
}

export async function getUsage(jwt: string): Promise<UsageSummary> {
  const res = await fetch(`${GATEWAY_BASE}/developer/usage`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (!res.ok) throw new Error('Failed to fetch usage');

  return (await res.json()) as UsageSummary;
}

export async function rotateApiKey(
  jwt: string,
  prefix: string,
): Promise<CreateKeyResult> {
  const res = await fetch(
    `${GATEWAY_BASE}/developer/keys/${encodeURIComponent(prefix)}/rotate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? 'Failed to rotate key',
    );
  }

  return (await res.json()) as CreateKeyResult;
}
