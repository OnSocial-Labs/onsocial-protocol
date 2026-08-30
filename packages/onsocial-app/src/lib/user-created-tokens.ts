export interface UserCreatedTokenRecord {
  contractId: string;
  name: string;
  symbol: string;
  createdAt: number;
  renounced: boolean;
  icon?: string;
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
    return parsed.filter(
      (row): row is UserCreatedTokenRecord =>
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
  const existing = listUserCreatedTokens(accountId).filter(
    (row) => row.contractId !== record.contractId
  );
  existing.unshift(record);
  writeUserCreatedTokens(accountId, existing);
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
