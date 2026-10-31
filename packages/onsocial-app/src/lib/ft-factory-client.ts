import { FT_FACTORY_NOT_READY } from '@/lib/ft-factory-copy';

const STORAGE_KEY = 'onsocial.ft-factory-pending';
const STORAGE_LIMIT = 5;

export interface FtFactoryFinishInput {
  createTxHash: string;
  contractId: string;
  name: string;
  symbol: string;
  totalSupply: string;
  icon: string;
  renounceOwner: boolean;
}

export type FtFactoryFinishResult =
  | { ok: true; txHash: string }
  | { ok: false; error: string; retryable: boolean };

interface StoredFinish extends FtFactoryFinishInput {
  savedAt: number;
}

function browserStorage(): Storage | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

function isStoredFinish(value: unknown): value is StoredFinish {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.createTxHash === 'string' &&
    typeof row.contractId === 'string' &&
    typeof row.name === 'string' &&
    typeof row.symbol === 'string' &&
    typeof row.totalSupply === 'string' &&
    typeof row.icon === 'string' &&
    typeof row.renounceOwner === 'boolean' &&
    typeof row.savedAt === 'number'
  );
}

function readStoredFinishes(storage: Storage | null): StoredFinish[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredFinish);
  } catch {
    return [];
  }
}

function writeStoredFinishes(storage: Storage | null, rows: StoredFinish[]) {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-STORAGE_LIMIT)));
}

/** Public key the wallet adds. Missing secret fails closed before any signature. */
export async function loadFtFactoryPublicKey(): Promise<string> {
  let payload: { ready?: unknown; publicKey?: unknown } = {};
  try {
    const response = await fetch('/api/ft-factory', {
      headers: { accept: 'application/json' },
    });
    payload = (await response.json()) as {
      ready?: unknown;
      publicKey?: unknown;
    };
  } catch {
    throw new Error(FT_FACTORY_NOT_READY);
  }
  const publicKey =
    typeof payload.publicKey === 'string' ? payload.publicKey.trim() : '';
  if (payload.ready !== true || !publicKey.startsWith('ed25519:')) {
    throw new Error(FT_FACTORY_NOT_READY);
  }
  return publicKey;
}

export function rememberFtFactoryFinish(input: FtFactoryFinishInput): void {
  const storage = browserStorage();
  const rows = readStoredFinishes(storage).filter(
    (row) => row.contractId !== input.contractId
  );
  rows.push({ ...input, savedAt: Date.now() });
  writeStoredFinishes(storage, rows);
}

export function readFtFactoryFinish(
  contractId: string
): FtFactoryFinishInput | null {
  const row = readStoredFinishes(browserStorage()).find(
    (entry) => entry.contractId === contractId
  );
  if (!row) return null;
  return {
    createTxHash: row.createTxHash,
    contractId: row.contractId,
    name: row.name,
    symbol: row.symbol,
    totalSupply: row.totalSupply,
    icon: row.icon,
    renounceOwner: row.renounceOwner,
  };
}

export function clearFtFactoryFinish(contractId: string): void {
  const storage = browserStorage();
  writeStoredFinishes(
    storage,
    readStoredFinishes(storage).filter((row) => row.contractId !== contractId)
  );
}

export function canFinishTakenTokenAccount(
  pending: { contractId: string } | null,
  contractId: string
): boolean {
  return Boolean(pending && contractId && pending.contractId === contractId);
}

export async function requestFtFactoryFinish(
  input: FtFactoryFinishInput
): Promise<FtFactoryFinishResult> {
  try {
    const response = await fetch('/api/ft-factory', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: unknown;
      txHash?: unknown;
      error?: unknown;
      retryable?: unknown;
    };
    if (data.ok === true && typeof data.txHash === 'string' && data.txHash) {
      return { ok: true, txHash: data.txHash };
    }
    const error =
      typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : 'Could not create the token.';
    return {
      ok: false,
      error,
      retryable: data.retryable !== false,
    };
  } catch {
    return {
      ok: false,
      error: 'Could not create the token.',
      retryable: true,
    };
  }
}
