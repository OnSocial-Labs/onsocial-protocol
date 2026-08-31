import type { UserCreatedTokenRecord } from '@/lib/user-created-tokens';

export async function fetchDiscoveredCreatorTokens(
  accountId: string
): Promise<UserCreatedTokenRecord[]> {
  const response = await fetch(
    `/api/tokens/discover?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store', headers: { accept: 'application/json' } }
  );
  const body = (await response.json().catch(() => null)) as {
    tokens?: UserCreatedTokenRecord[];
    error?: string;
    detail?: string;
  } | null;
  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Token discover failed (${response.status})`
    );
  }
  return Array.isArray(body?.tokens) ? body.tokens : [];
}
