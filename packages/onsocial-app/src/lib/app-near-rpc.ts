import {
  ACTIVE_NEAR_NETWORK,
  RELAYER_ACCOUNT,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import {
  createBffNearRpcClient,
  createConfiguredNearRpc,
  resolveNearRpcBffEndpoint,
  type NearRpc,
  type NearRpcResponse,
} from '@onsocial/rpc';

const NEAR_DECIMALS = 24;
const NEAR_STORAGE_BYTE_COST = 10_000_000_000_000_000_000n;
const NEAR_TX_POLL_INTERVAL_MS = 1_500;
const NEAR_TX_POLL_TIMEOUT_MS = 45_000;

export interface NearAccountView {
  amount: string;
  locked: string;
  storage_usage: number;
}

interface NearTransactionStatusResponse {
  final_execution_status?: string;
  status?: unknown;
  receipts_outcome?: Array<{ outcome?: { status?: unknown; logs?: string[] } }>;
}

export interface NearTransactionConfirmationResult {
  ok: boolean;
  txHash: string;
  errorMessage?: string;
}

let _rpc: NearRpc | null = null;

function getRpc(): NearRpc {
  if (!_rpc) {
    if (typeof window !== 'undefined') {
      _rpc = createBffNearRpcClient({
        endpoint: resolveNearRpcBffEndpoint({ path: '/api/near/rpc' }),
        network: ACTIVE_NEAR_NETWORK,
      });
    } else {
      _rpc = createConfiguredNearRpc({
        network: ACTIVE_NEAR_NETWORK,
        publicOnly: false,
        timeoutMs: 8_000,
        maxRetries: 1,
      });
    }
  }
  return _rpc;
}

async function nearRpcCall<T>(method: string, params: unknown): Promise<T> {
  const response = await getRpc().call<T>(method, params);
  if (response.error?.message) {
    throw new Error(response.error.message);
  }
  if (response.result === undefined) {
    throw new Error('NEAR RPC returned no result');
  }
  return response.result;
}

function isNearUnknownAccountError(
  error: NonNullable<NearRpcResponse['error']>
): boolean {
  if (error.cause?.name === 'UNKNOWN_ACCOUNT') return true;
  const blob = [
    error.message,
    typeof error.data === 'string' ? error.data : '',
  ]
    .join(' ')
    .toLowerCase();
  return (
    blob.includes('does not exist') ||
    blob.includes('unknown account') ||
    blob.includes('account not found')
  );
}

function maxYocto(value: bigint): string {
  return (value > 0n ? value : 0n).toString();
}

function sanitizeDecimalAmountInput(value: string, maxDecimals: number): string {
  let normalized = value
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/[^\d.]/g, '');

  const firstDot = normalized.indexOf('.');
  if (firstDot >= 0) {
    normalized =
      normalized.slice(0, firstDot + 1) +
      normalized.slice(firstDot + 1).replace(/\./g, '');
  }

  if (normalized.startsWith('.')) {
    normalized = `0${normalized}`;
  }

  if (!normalized.includes('.') && /^0\d+$/.test(normalized)) {
    normalized = `0.${normalized.slice(1)}`;
  }

  const hasTrailingDot = normalized.endsWith('.');
  const [rawWhole = '0', rawFraction = ''] = normalized.split('.');
  let whole = rawWhole.replace(/^0+(?=\d)/, '');
  if (!whole) whole = '0';

  const fraction = rawFraction.slice(0, maxDecimals);
  if (hasTrailingDot && fraction.length === 0) {
    return `${whole}.`;
  }

  return fraction ? `${whole}.${fraction}` : whole;
}

export function tokenAmountToSmallestUnit(
  input: string,
  decimals: number
): string {
  const sanitized = sanitizeDecimalAmountInput(input.trim(), decimals);
  if (!sanitized || sanitized === '0' || sanitized === '0.') return '0';

  const dotIdx = sanitized.indexOf('.');
  let whole: string;
  let frac: string;

  if (dotIdx === -1) {
    whole = sanitized;
    frac = '';
  } else {
    whole = sanitized.slice(0, dotIdx) || '0';
    frac = sanitized.slice(dotIdx + 1);
  }

  const padded = frac.padEnd(decimals, '0').slice(0, decimals);
  const raw = whole + padded;
  return raw.replace(/^0+/, '') || '0';
}

export function nearToYocto(input: string): string {
  return tokenAmountToSmallestUnit(input, NEAR_DECIMALS);
}

export function yoctoToNear(yocto: string): string {
  if (!yocto || yocto === '0') return '0';
  const padded = yocto.padStart(NEAR_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - NEAR_DECIMALS) || '0';
  const frac = padded.slice(padded.length - NEAR_DECIMALS).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export function getSpendableNearBalance(account: NearAccountView | null): string {
  if (!account) {
    return '0';
  }

  const storageReserve = BigInt(account.storage_usage) * NEAR_STORAGE_BYTE_COST;
  const totalAmount = BigInt(account.amount || '0');
  const lockedAmount = BigInt(account.locked || '0');

  return maxYocto(totalAmount - lockedAmount - storageReserve);
}

export async function viewAccount(
  accountId: string
): Promise<NearAccountView | null> {
  const response = await getRpc().call<NearAccountView>('query', {
    request_type: 'view_account',
    finality: 'final',
    account_id: accountId,
  });
  if (response.error) {
    if (isNearUnknownAccountError(response.error)) return null;
    const data =
      typeof response.error.data === 'string' ? response.error.data : '';
    throw new Error(
      data ? `${response.error.message}: ${data}` : response.error.message
    );
  }
  if (response.result === undefined) {
    throw new Error('NEAR RPC returned no result');
  }
  return response.result;
}

/** Normalize `ft_balance_of` view output (string or NEAR U128 `{ "0": "…" }`). */
export function normalizeFtBalanceYocto(value: unknown): bigint {
  if (value == null) {
    return 0n;
  }
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'object') {
    const u128 =
      value !== null && '0' in value && (value as { 0?: unknown })['0'] != null
        ? (value as { 0: unknown })['0']
        : null;
    if (typeof u128 === 'string') {
      try {
        return BigInt(u128);
      } catch {
        return 0n;
      }
    }
  }
  return 0n;
}

/** Call a NEAR view method and JSON-decode the result. */
export async function viewNearContract<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const result = await nearRpcCall<{ result: number[] }>('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: contractId,
    method_name: methodName,
    args_base64: btoa(JSON.stringify(args)),
  });

  if (!result.result?.length) {
    throw new Error('Contract view returned no result');
  }

  const decoded = new TextDecoder().decode(new Uint8Array(result.result));
  return JSON.parse(decoded) as T;
}

/** On-chain SOCIAL (NEP-141) wallet balance for an account. */
export async function getSocialWalletBalanceYocto(
  accountId: string
): Promise<bigint> {
  const balance = await viewNearContract<unknown>(
    SOCIAL_TOKEN_CONTRACT,
    'ft_balance_of',
    { account_id: accountId }
  );
  return normalizeFtBalanceYocto(balance);
}

function extractNearTransactionHash(result: unknown): string | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const outcome = result as {
    transaction_outcome?: { id?: string };
    transaction?: { hash?: string };
    hash?: string;
    transactionHash?: string;
  };

  return (
    outcome.transaction_outcome?.id ??
    outcome.transaction?.hash ??
    outcome.hash ??
    outcome.transactionHash ??
    null
  );
}

export function extractNearTransactionHashes(result: unknown): string[] {
  if (Array.isArray(result)) {
    return result.flatMap((item) => extractNearTransactionHashes(item));
  }

  const hash = extractNearTransactionHash(result);
  return hash ? [hash] : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function findFailure(value: unknown): unknown | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const failure = findFailure(item);
      if (failure) return failure;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  if ('Failure' in value) {
    return (value as { Failure?: unknown }).Failure ?? null;
  }

  for (const nested of Object.values(value)) {
    const failure = findFailure(nested);
    if (failure) return failure;
  }

  return null;
}

function extractFailureMessage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractFailureMessage(item);
      if (message) return message;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  for (const key of ['ExecutionError', 'error_message', 'error', 'kind']) {
    if (key in value) {
      const message = extractFailureMessage(
        (value as Record<string, unknown>)[key]
      );
      if (message) return message;
    }
  }

  for (const nested of Object.values(value)) {
    const message = extractFailureMessage(nested);
    if (message) return message;
  }

  return 'Transaction failed on-chain';
}

function extractFailureFromStatus(
  status: NearTransactionStatusResponse
): string | null {
  const topLevelFailure = extractFailureMessage(
    findFailure([status.status, status.receipts_outcome])
  );
  if (topLevelFailure) return topLevelFailure;

  for (const receipt of status.receipts_outcome ?? []) {
    const receiptFailure = extractFailureMessage(
      findFailure(receipt.outcome?.status)
    );
    if (receiptFailure) return receiptFailure;
  }

  return null;
}

function isUnknownNearTransactionError(message: string): boolean {
  return /unknown transaction|does not exist|transaction .* not found/i.test(
    message
  );
}

function nearTxStatusSignerIds(accountId: string): string[] {
  return accountId === RELAYER_ACCOUNT
    ? [accountId]
    : [accountId, RELAYER_ACCOUNT];
}

async function getNearTransactionStatus(
  txHash: string,
  accountId: string
): Promise<NearTransactionStatusResponse | null> {
  let sawUnknown = false;
  let lastError: Error | null = null;

  for (const signerId of nearTxStatusSignerIds(accountId)) {
    try {
      return await nearRpcCall<NearTransactionStatusResponse>(
        'EXPERIMENTAL_tx_status',
        [txHash, signerId]
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to load transaction status';
      if (isUnknownNearTransactionError(message)) {
        sawUnknown = true;
        continue;
      }
      lastError = error instanceof Error ? error : new Error(message);
    }
  }

  if (sawUnknown) {
    return null;
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

export async function waitForNearTransactionConfirmation({
  txHash,
  accountId,
  timeoutMs = NEAR_TX_POLL_TIMEOUT_MS,
  pollIntervalMs = NEAR_TX_POLL_INTERVAL_MS,
}: {
  txHash: string;
  accountId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<NearTransactionConfirmationResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await getNearTransactionStatus(txHash, accountId);

    if (!status) {
      await sleep(pollIntervalMs);
      continue;
    }

    const failure = extractFailureFromStatus(status);
    if (failure) {
      return { ok: false, txHash, errorMessage: failure };
    }

    if (status.final_execution_status === 'FINAL') {
      return { ok: true, txHash };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error('Timed out waiting for on-chain confirmation');
}

export async function waitForNearTransactionBatchConfirmation({
  txHashes,
  accountId,
  timeoutMs = NEAR_TX_POLL_TIMEOUT_MS,
  pollIntervalMs = NEAR_TX_POLL_INTERVAL_MS,
}: {
  txHashes: string[];
  accountId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<NearTransactionConfirmationResult> {
  const uniqueHashes = [...new Set(txHashes.filter(Boolean))];

  if (uniqueHashes.length === 0) {
    return { ok: true, txHash: '' };
  }

  const results = await Promise.all(
    uniqueHashes.map((txHash) =>
      waitForNearTransactionConfirmation({
        txHash,
        accountId,
        timeoutMs,
        pollIntervalMs,
      })
    )
  );

  return (
    results.find((result) => !result.ok) ?? {
      ok: true,
      txHash: uniqueHashes[0]!,
    }
  );
}
