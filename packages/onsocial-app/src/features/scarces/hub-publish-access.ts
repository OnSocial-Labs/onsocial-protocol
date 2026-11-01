import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export type PublishAccessStatus = 'pending' | 'declined' | 'blocked';

export interface PublishAccessRequest {
  accountId: string;
  status: PublishAccessStatus;
  message: string | null;
  requestedAtMs: number;
  decidedBy: string | null;
}

function asStatus(value: unknown): PublishAccessStatus | null {
  if (value === 'pending' || value === 'declined' || value === 'blocked') {
    return value;
  }
  return null;
}

function nsToMs(value: unknown): number {
  const raw =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  if (!/^\d+$/.test(raw)) return 0;
  return Number(BigInt(raw) / 1_000_000n);
}

/** Contract view row → inbox row. Null when the view is empty or unreadable. */
export function parsePublishAccessRequest(
  raw: unknown
): PublishAccessRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const status = asStatus(row.status);
  const accountId = typeof row.account_id === 'string' ? row.account_id : '';
  if (!status || !accountId) return null;
  const message = typeof row.message === 'string' ? row.message.trim() : '';
  return {
    accountId,
    status,
    message: message || null,
    requestedAtMs: nsToMs(row.requested_at),
    decidedBy: typeof row.decided_by === 'string' ? row.decided_by : null,
  };
}

export async function fetchPublishRequest(
  appId: string,
  accountId: string
): Promise<PublishAccessRequest | null> {
  const id = appId.trim();
  const account = accountId.trim();
  if (!id || !account) return null;
  const raw = await viewNearContract<unknown>(
    SCARCES_CONTRACT,
    'get_publish_request',
    { app_id: id, account_id: account }
  );
  return parsePublishAccessRequest(raw);
}

export async function fetchPublishRequests(
  appId: string,
  status?: PublishAccessStatus
): Promise<PublishAccessRequest[]> {
  const id = appId.trim();
  if (!id) return [];
  const raw = await viewNearContract<unknown[]>(
    SCARCES_CONTRACT,
    'get_publish_requests',
    {
      app_id: id,
      status: status ?? null,
      from_index: 0,
      limit: 100,
    }
  );
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    const parsed = parsePublishAccessRequest(row);
    return parsed ? [parsed] : [];
  });
}
