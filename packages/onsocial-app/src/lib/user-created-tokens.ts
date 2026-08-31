import { viewNearContract } from '@/lib/app-near-rpc';
import { probeNearAccountExists } from '@/hooks/use-near-account-status';

export interface UserCreatedTokenRecord {
  contractId: string;
  name: string;
  symbol: string;
  createdAt: number;
  renounced: boolean;
  icon?: string;
  /** NEP-141 decimals. Creator template is 18; added tokens may differ. */
  decimals?: number;
}

const STORAGE_PREFIX = 'onsocial.app.user-tokens.';

function storageKey(accountId: string): string {
  return `${STORAGE_PREFIX}${accountId.trim().toLowerCase()}`;
}

export function listUserCreatedTokens(
  accountId: string | null | undefined
): UserCreatedTokenRecord[] {
  if (typeof window === 'undefined' || !accountId?.trim()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is UserCreatedTokenRecord =>
      Boolean(
        row &&
          typeof row === 'object' &&
          typeof (row as UserCreatedTokenRecord).contractId === 'string' &&
          typeof (row as UserCreatedTokenRecord).name === 'string' &&
          typeof (row as UserCreatedTokenRecord).symbol === 'string'
      )
    );
  } catch {
    return [];
  }
}

function writeUserCreatedTokens(
  accountId: string,
  records: UserCreatedTokenRecord[]
): void {
  try {
    window.localStorage.setItem(
      storageKey(accountId),
      JSON.stringify(records.slice(0, 40))
    );
  } catch {
    // ignore quota
  }
}

export function rememberUserCreatedToken(
  accountId: string,
  record: UserCreatedTokenRecord
): void {
  if (typeof window === 'undefined' || !accountId.trim()) return;
  const existing = listUserCreatedTokens(accountId);
  const prior = existing.find((row) => row.contractId === record.contractId);
  const nextRecord = {
    ...prior,
    ...record,
    createdAt: prior?.createdAt ?? record.createdAt,
  };
  writeUserCreatedTokens(accountId, [
    nextRecord,
    ...existing.filter((row) => row.contractId !== record.contractId),
  ]);
}

/** Merge recovered tokens without jumping existing rows to the top. */
export function rememberDiscoveredTokens(
  accountId: string,
  records: UserCreatedTokenRecord[]
): UserCreatedTokenRecord[] {
  if (typeof window === 'undefined' || !accountId.trim()) {
    return [];
  }
  const current = listUserCreatedTokens(accountId);
  const byId = new Map(current.map((row) => [row.contractId, row]));
  for (const record of records) {
    const prior = byId.get(record.contractId);
    byId.set(record.contractId, {
      ...prior,
      ...record,
      createdAt: prior?.createdAt ?? record.createdAt,
    });
  }
  const next: UserCreatedTokenRecord[] = [];
  const seen = new Set<string>();
  for (const row of current) {
    const merged = byId.get(row.contractId);
    if (!merged) continue;
    next.push(merged);
    seen.add(row.contractId);
  }
  for (const record of records) {
    if (seen.has(record.contractId)) continue;
    const merged = byId.get(record.contractId);
    if (!merged) continue;
    next.push(merged);
    seen.add(record.contractId);
  }
  writeUserCreatedTokens(accountId, next);
  return next;
}

export function patchUserCreatedToken(
  accountId: string,
  contractId: string,
  patch: Partial<UserCreatedTokenRecord>
): void {
  if (typeof window === 'undefined' || !accountId.trim()) return;
  const next = listUserCreatedTokens(accountId).map((row) =>
    row.contractId === contractId ? { ...row, ...patch } : row
  );
  writeUserCreatedTokens(accountId, next);
}

interface FtMetadataView {
  symbol?: string;
  name?: string;
  icon?: string | null;
  decimals?: number;
}

/**
 * Self-healing ledger: verify each recorded token on-chain. Drops records
 * whose contract account is gone, refreshes metadata that drifted (icon
 * update via manage sheet). Records survive intact on probe/RPC failure —
 * a network blip never wipes the list.
 */
export async function reconcileUserCreatedTokens(
  accountId: string
): Promise<UserCreatedTokenRecord[]> {
  const records = listUserCreatedTokens(accountId);
  if (records.length === 0) return records;

  const checked = await Promise.all(
    records.map(async (record) => {
      // Server-side account probe — reliable from the browser.
      const exists = await probeNearAccountExists(record.contractId).catch(
        () => null
      );
      // Probe uncertain — keep the record rather than dropping on a blip.
      if (exists === null) return record;
      // Account is gone — stale record, drop it.
      if (!exists) return null;
      // Account lives — refresh metadata when the FT view answers.
      const metadata = await viewNearContract<FtMetadataView>(
        record.contractId,
        'ft_metadata',
        {}
      ).catch(() => null);
      if (!metadata) return record;
      return {
        ...record,
        name: metadata.name?.trim() || record.name,
        symbol: metadata.symbol?.trim() || record.symbol,
        icon: metadata.icon ?? record.icon,
        decimals:
          typeof metadata.decimals === 'number'
            ? metadata.decimals
            : record.decimals,
      };
    })
  );

  const next = checked.filter(
    (row): row is UserCreatedTokenRecord => row !== null
  );
  if (JSON.stringify(next) !== JSON.stringify(records)) {
    writeUserCreatedTokens(accountId, next);
  }
  return next;
}
