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

/**
 * Authenticate with the gateway via NEAR wallet signature.
 * Returns a short-lived JWT for key management.
 */
export async function gatewayLogin(
  wallet: NearWalletBase,
  accountId: string,
): Promise<string> {
  if (typeof wallet.signMessage !== 'function') {
    throw new Error('Wallet does not support message signing');
  }

  const timestamp = new Date().toISOString();
  const message = `OnSocial Auth: ${timestamp}`;
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const recipient = 'onsocial.id';

  const signed = await wallet.signMessage({
    network: ACTIVE_NEAR_NETWORK,
    signerId: accountId,
    message,
    recipient,
    nonce,
  });

  // Encode the nonce as base64 for the gateway
  const nonceBase64 = btoa(String.fromCharCode(...nonce));

  const res = await fetch(`${GATEWAY_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: signed.accountId,
      message,
      signature: signed.signature,
      publicKey: signed.publicKey,
      nonce: nonceBase64,
      recipient,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Login failed (${res.status})`,
    );
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
