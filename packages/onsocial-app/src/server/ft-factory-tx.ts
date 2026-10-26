import {
  Action,
  KeyPair,
  KeyPairSigner,
  PublicKey,
  actions,
  baseDecode,
  baseEncode,
  createTransaction,
  encodeTransaction,
  type KeyPairString,
} from 'near-api-js';
import {
  FT_NAME_MAX,
  FT_SUPPLY_MAX_TOKENS,
  FT_SYMBOL_MAX,
  getFtIconError,
  normalizeFtName,
  normalizeFtSymbol,
} from '@/lib/app-create-token';
import {
  FT_TOKEN_DECIMALS,
  type FtTemplateIdentifier,
} from '@/lib/app-ft-template-config';
import { isValidNearAccountId } from '@/lib/app-near-account';
import { FT_FACTORY_NOT_READY } from '@/lib/ft-factory-copy';
import type { FtFactoryFinishInput } from '@/lib/ft-factory-client';

/** Same gas the wallet batch used for `new` and `renounce_owner`. */
export const FT_INIT_GAS = 100_000_000_000_000n;

const SIGN_ATTEMPTS = 3;
const DEFAULT_POLL_TIMEOUT_MS = 45_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const TX_HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

export type FactoryFinishCode = 'not-ready' | 'invalid' | 'refused' | 'failed';

export type FinishCreatorTokenResult =
  | { ok: true; txHash: string }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      code: FactoryFinishCode;
    };

export interface FactoryRpc {
  call<T>(method: string, params: unknown): Promise<T>;
}

export interface FinishCreatorTokenDeps {
  rpc: FactoryRpc;
  secretKey: string;
  template: FtTemplateIdentifier | null;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
}

interface VerifiedCreateTx {
  ownerId: string;
  contractId: string;
}

type FinishPlan =
  | { kind: 'done' }
  | { kind: 'stop'; error: string; retryable: boolean; code: FactoryFinishCode }
  | {
      kind: 'send';
      includeDeploy: boolean;
      includeInit: boolean;
    };

export function factoryKeyFromSecret(
  secret: string
): { publicKey: string; secretKey: string } | null {
  const trimmed = secret.trim();
  if (!trimmed.startsWith('ed25519:')) return null;
  try {
    const pair = KeyPair.fromString(trimmed as KeyPairString);
    const publicKey = pair.getPublicKey().toString();
    if (!publicKey.startsWith('ed25519:')) return null;
    return { publicKey, secretKey: trimmed };
  } catch {
    return null;
  }
}

/** Immediate parent. Only that account can create `label.parent`. */
export function immediateParentAccountId(accountId: string): string | null {
  const dot = accountId.indexOf('.');
  if (dot <= 0 || dot >= accountId.length - 1) return null;
  const label = accountId.slice(0, dot);
  if (!label || label.includes('.')) return null;
  return accountId.slice(dot + 1);
}

function fail(
  error: string,
  code: FactoryFinishCode,
  retryable: boolean
): FinishCreatorTokenResult {
  return { ok: false, error, retryable, code };
}

function positiveYocto(value: unknown): boolean {
  if (typeof value === 'bigint') return value > 0n;
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function isFullAccess(permission: unknown): boolean {
  if (permission === 'FullAccess') return true;
  if (!permission || typeof permission !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(permission, 'FullAccess');
}

type ParsedAction =
  | { kind: 'CreateAccount' }
  | { kind: 'Transfer'; deposit: unknown }
  | { kind: 'AddKey'; publicKey: string; permission: unknown }
  | { kind: 'Other' };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readAddKey(body: Record<string, unknown>): ParsedAction {
  const publicKeyRaw = body.public_key ?? body.publicKey;
  const publicKey = typeof publicKeyRaw === 'string' ? publicKeyRaw.trim() : '';
  const accessKey = asRecord(body.access_key ?? body.accessKey);
  return {
    kind: 'AddKey',
    publicKey,
    permission: accessKey?.permission,
  };
}

/** Chain JSON (`{ Transfer: { deposit } }`) and the wallet action shape. */
export function parseCreateAction(action: unknown): ParsedAction {
  if (action === 'CreateAccount') return { kind: 'CreateAccount' };
  if (typeof action === 'string') return { kind: 'Other' };

  const record = asRecord(action);
  if (!record) return { kind: 'Other' };

  if (typeof record.type === 'string') {
    if (record.type === 'CreateAccount') return { kind: 'CreateAccount' };
    const params = asRecord(record.params) ?? record;
    if (record.type === 'Transfer') {
      return { kind: 'Transfer', deposit: params.deposit };
    }
    if (record.type === 'AddKey') return readAddKey(params);
    return { kind: 'Other' };
  }

  const keys = Object.keys(record);
  if (keys.length !== 1) return { kind: 'Other' };
  const key = keys[0]!;
  const inner = asRecord(record[key]) ?? {};
  if (key === 'CreateAccount') return { kind: 'CreateAccount' };
  if (key === 'Transfer') return { kind: 'Transfer', deposit: inner.deposit };
  if (key === 'AddKey') return readAddKey(inner);
  return { kind: 'Other' };
}

function hasFailureNode(value: unknown, depth = 0): boolean {
  if (depth > 6 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasFailureNode(item, depth + 1));
  }
  if (Object.prototype.hasOwnProperty.call(value, 'Failure')) return true;
  return Object.entries(value).some(([key, nested]) => {
    if (key === 'logs' || key === 'metadata') return false;
    return hasFailureNode(nested, depth + 1);
  });
}

function txHasFailure(status: unknown): boolean {
  return hasFailureNode(status);
}

/**
 * The wallet tx must be final, signed by the parent, and contain only
 * CreateAccount + a positive Transfer + AddKey of our full-access key.
 */
export function verifyCreateTransaction(input: {
  status: unknown;
  contractId: string;
  factoryPublicKey: string;
}):
  | { ok: true; value: VerifiedCreateTx }
  | { ok: false; error: string; retryable: boolean } {
  const status = asRecord(input.status);
  if (!status) {
    return {
      ok: false,
      error: 'The account transaction is not final yet.',
      retryable: true,
    };
  }
  if (status.final_execution_status !== 'FINAL') {
    return {
      ok: false,
      error: 'The account transaction is not final yet.',
      retryable: true,
    };
  }
  if (txHasFailure(status.status) || txHasFailure(status.receipts_outcome)) {
    return {
      ok: false,
      error: 'The account transaction failed.',
      retryable: false,
    };
  }

  const transaction = asRecord(status.transaction);
  const signerId =
    typeof transaction?.signer_id === 'string' ? transaction.signer_id : '';
  const receiverId =
    typeof transaction?.receiver_id === 'string' ? transaction.receiver_id : '';
  const parent = immediateParentAccountId(input.contractId);
  if (
    !parent ||
    signerId !== parent ||
    receiverId !== input.contractId ||
    !input.contractId.endsWith(`.${signerId}`)
  ) {
    return {
      ok: false,
      error: 'That account was not created by its parent.',
      retryable: false,
    };
  }

  const actionsRaw = Array.isArray(transaction?.actions)
    ? transaction.actions
    : [];
  const parsed = actionsRaw.map(parseCreateAction);
  if (
    parsed.length !== 3 ||
    parsed[0]?.kind !== 'CreateAccount' ||
    parsed[1]?.kind !== 'Transfer' ||
    parsed[2]?.kind !== 'AddKey'
  ) {
    return {
      ok: false,
      error: 'That transaction is not a token account create.',
      retryable: false,
    };
  }

  const transfer = parsed[1];
  if (transfer.kind !== 'Transfer' || !positiveYocto(transfer.deposit)) {
    return {
      ok: false,
      error: 'That transaction did not fund the account.',
      retryable: false,
    };
  }

  const addKey = parsed[2];
  if (
    addKey.kind !== 'AddKey' ||
    addKey.publicKey !== input.factoryPublicKey ||
    !isFullAccess(addKey.permission)
  ) {
    return {
      ok: false,
      error: 'That transaction did not add the factory key.',
      retryable: false,
    };
  }

  return {
    ok: true,
    value: { ownerId: signerId, contractId: input.contractId },
  };
}

export function decideFinishPlan(input: {
  codeHash: string | null;
  expectedCodeHash: string;
  factoryKeyPresent: boolean;
  initialized: boolean;
}): FinishPlan {
  const hashMatches =
    input.codeHash !== null && input.codeHash === input.expectedCodeHash;

  if (input.codeHash !== null && !hashMatches) {
    return {
      kind: 'stop',
      error: 'This account already has different contract code.',
      retryable: false,
      code: 'refused',
    };
  }

  if (!input.factoryKeyPresent && (!hashMatches || !input.initialized)) {
    return {
      kind: 'stop',
      error: 'The factory key is gone and the token was not installed.',
      retryable: false,
      code: 'failed',
    };
  }

  if (hashMatches && !input.factoryKeyPresent) {
    return { kind: 'done' };
  }

  if (!hashMatches) {
    return {
      kind: 'send',
      includeDeploy: true,
      includeInit: true,
    };
  }

  if (!input.initialized) {
    return {
      kind: 'send',
      includeDeploy: false,
      includeInit: true,
    };
  }

  return {
    kind: 'send',
    includeDeploy: false,
    includeInit: false,
  };
}

/**
 * `near-api-js` treats a string `codeHash` as hex. The published template hash
 * is base58, so the bytes have to be decoded before `useGlobalContract`.
 */
export function buildFinishActions(input: {
  template: FtTemplateIdentifier;
  publicKey: PublicKey;
  ownerId: string;
  name: string;
  symbol: string;
  totalSupply: string;
  icon: string;
  includeDeploy: boolean;
  includeInit: boolean;
}): Action[] {
  const built: Action[] = [];
  if (input.includeDeploy) {
    built.push(
      input.template.kind === 'codeHash'
        ? actions.useGlobalContract({
            codeHash: baseDecode(input.template.codeHash),
          })
        : actions.useGlobalContract({ accountId: input.template.accountId })
    );
  }
  if (input.includeInit) {
    built.push(
      actions.functionCall(
        'new',
        {
          owner_id: input.ownerId,
          name: input.name,
          symbol: input.symbol,
          total_supply: input.totalSupply,
          icon: input.icon,
        },
        FT_INIT_GAS,
        0n
      )
    );
  }
  // `renounce_owner` requires the owner as predecessor. This transaction is
  // signed by the token account, so the creator locks admin from their wallet.
  built.push(actions.deleteKey(input.publicKey));
  return built;
}

export async function signFinishTransaction(input: {
  secretKey: string;
  contractId: string;
  nonce: bigint;
  blockHash: string;
  txActions: Action[];
}): Promise<{ signedTxBase64: string; txHash: string }> {
  const key = factoryKeyFromSecret(input.secretKey);
  if (!key) throw new Error(FT_FACTORY_NOT_READY);
  const signer = KeyPairSigner.fromSecretKey(input.secretKey as KeyPairString);
  const publicKey = PublicKey.from(key.publicKey);
  const transaction = createTransaction(
    input.contractId,
    publicKey,
    input.contractId,
    input.nonce,
    input.txActions,
    baseDecode(input.blockHash)
  );
  const { txHash, signedTransaction } =
    await signer.signTransaction(transaction);
  return {
    txHash: baseEncode(txHash),
    signedTxBase64: Buffer.from(encodeTransaction(signedTransaction)).toString(
      'base64'
    ),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAbsentChainRecord(error: unknown): boolean {
  const message = errorText(error).toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes("doesn't exist") ||
    message.includes('unknown account') ||
    message.includes('unknown access key') ||
    message.includes('access key not found') ||
    message.includes('no contract code') ||
    message.includes('no global contract') ||
    message.includes('method not found') ||
    message.includes('methodnotfound') ||
    message.includes('not initialized') ||
    message.includes('guest panic')
  );
}

export function isNonceError(error: unknown): boolean {
  return /nonce/i.test(errorText(error));
}

function isUnknownTransaction(error: unknown): boolean {
  return /unknown transaction|transaction .*not found|db not found/i.test(
    errorText(error)
  );
}

function nextNonce(nonce: unknown): bigint | null {
  if (typeof nonce === 'bigint') return nonce + 1n;
  if (typeof nonce === 'number' && Number.isSafeInteger(nonce) && nonce >= 0) {
    return BigInt(nonce) + 1n;
  }
  if (typeof nonce === 'string' && /^\d+$/.test(nonce))
    return BigInt(nonce) + 1n;
  return null;
}

function validateFinishInput(
  input: FtFactoryFinishInput
): { ok: true; value: FtFactoryFinishInput } | FinishCreatorTokenResult {
  const contractId = input.contractId.trim().toLowerCase();
  const createTxHash = input.createTxHash.trim();
  const name = normalizeFtName(input.name).trim();
  const symbol = normalizeFtSymbol(input.symbol);
  const totalSupply = input.totalSupply.trim();
  const icon = input.icon.trim();

  if (!TX_HASH_PATTERN.test(createTxHash)) {
    return fail('That transaction hash is not valid.', 'invalid', false);
  }
  if (
    !isValidNearAccountId(contractId) ||
    !immediateParentAccountId(contractId)
  ) {
    return fail('That token account id is not valid.', 'invalid', false);
  }
  if (name.length < 2 || name.length > FT_NAME_MAX) {
    return fail('Enter a token name.', 'invalid', false);
  }
  if (symbol.length < 1 || symbol.length > FT_SYMBOL_MAX) {
    return fail('Enter a token symbol.', 'invalid', false);
  }
  if (!/^\d+$/.test(totalSupply) || totalSupply === '0') {
    return fail('Enter a total supply greater than zero.', 'invalid', false);
  }
  try {
    const cap = FT_SUPPLY_MAX_TOKENS * 10n ** BigInt(FT_TOKEN_DECIMALS);
    if (BigInt(totalSupply) > cap) {
      return fail('Supply is too large.', 'invalid', false);
    }
  } catch {
    return fail('Enter a valid supply.', 'invalid', false);
  }
  const iconError = getFtIconError(icon);
  if (iconError) return fail(iconError, 'invalid', false);

  return {
    ok: true,
    value: {
      createTxHash,
      contractId,
      name,
      symbol,
      totalSupply,
      icon,
      renounceOwner: input.renounceOwner === true,
    },
  };
}

async function queryOrNull<T>(
  rpc: FactoryRpc,
  params: Record<string, unknown>
): Promise<T | null> {
  try {
    return await rpc.call<T>('query', params);
  } catch (error) {
    if (isAbsentChainRecord(error)) return null;
    throw error;
  }
}

async function expectedTemplateHash(
  rpc: FactoryRpc,
  template: FtTemplateIdentifier
): Promise<string> {
  if (template.kind === 'codeHash') {
    const code = await rpc.call<{ hash?: string; code_base64?: string }>(
      'query',
      {
        request_type: 'view_global_contract_code',
        finality: 'final',
        code_hash: template.codeHash,
      }
    );
    if (!code?.code_base64 && !code?.hash) {
      throw new Error(FT_FACTORY_NOT_READY);
    }
    return template.codeHash;
  }
  const code = await rpc.call<{ hash?: string; code_base64?: string }>(
    'query',
    {
      request_type: 'view_global_contract_code_by_account_id',
      finality: 'final',
      account_id: template.accountId,
    }
  );
  if (!code?.hash) throw new Error(FT_FACTORY_NOT_READY);
  return code.hash;
}

async function readInstalledCode(
  rpc: FactoryRpc,
  contractId: string
): Promise<string | null> {
  const code = await queryOrNull<{ hash?: string; code_base64?: string }>(rpc, {
    request_type: 'view_code',
    finality: 'final',
    account_id: contractId,
  });
  if (!code?.hash) return null;
  return code.hash;
}

async function factoryKeyOnAccount(
  rpc: FactoryRpc,
  contractId: string,
  publicKey: string
): Promise<{ present: boolean; nonce: bigint | null }> {
  const key = await queryOrNull<{ nonce?: unknown; permission?: unknown }>(
    rpc,
    {
      request_type: 'view_access_key',
      finality: 'final',
      account_id: contractId,
      public_key: publicKey,
    }
  );
  if (!key) return { present: false, nonce: null };
  if (!isFullAccess(key.permission)) {
    return { present: false, nonce: null };
  }
  return { present: true, nonce: nextNonce(key.nonce) };
}

async function tokenInitialized(
  rpc: FactoryRpc,
  contractId: string
): Promise<boolean> {
  const metadata = await queryOrNull<unknown>(rpc, {
    request_type: 'call_function',
    finality: 'final',
    account_id: contractId,
    method_name: 'ft_metadata',
    args_base64: Buffer.from('{}').toString('base64'),
  });
  return metadata !== null;
}

function outcomeFailed(outcome: unknown): { failed: boolean; nonce: boolean } {
  if (!hasFailureNode(outcome)) return { failed: false, nonce: false };
  return {
    failed: true,
    nonce: /nonce/i.test(JSON.stringify(outcome ?? null)),
  };
}

async function waitUntilFinal(
  rpc: FactoryRpc,
  txHash: string,
  accountId: string,
  deps: FinishCreatorTokenDeps
): Promise<{ ok: true } | { ok: false; error: string; nonce: boolean }> {
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeout = deps.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const interval = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = now() + timeout;

  while (now() < deadline) {
    try {
      const status = await rpc.call<Record<string, unknown>>(
        'EXPERIMENTAL_tx_status',
        [txHash, accountId]
      );
      const failure = outcomeFailed(status);
      if (failure.failed) {
        return {
          ok: false,
          error: 'Could not install the token.',
          nonce: failure.nonce,
        };
      }
      if (status.final_execution_status === 'FINAL') return { ok: true };
    } catch (error) {
      if (isNonceError(error)) {
        return {
          ok: false,
          error: 'Could not install the token.',
          nonce: true,
        };
      }
      if (!isUnknownTransaction(error) && !isAbsentChainRecord(error)) {
        return {
          ok: false,
          error: 'Could not install the token.',
          nonce: false,
        };
      }
    }
    await sleep(interval);
  }

  return {
    ok: false,
    error: 'Timed out waiting for the token install.',
    nonce: false,
  };
}

async function broadcastFinish(
  deps: FinishCreatorTokenDeps,
  input: {
    secretKey: string;
    contractId: string;
    publicKey: string;
    txActions: Action[];
  }
): Promise<{ ok: true; txHash: string } | FinishCreatorTokenResult> {
  let lastError = 'Could not install the token.';
  for (let attempt = 0; attempt < SIGN_ATTEMPTS; attempt += 1) {
    const accessKey = await factoryKeyOnAccount(
      deps.rpc,
      input.contractId,
      input.publicKey
    );
    if (!accessKey.present || accessKey.nonce === null) {
      // A parallel finish may have deleted the key. Retry sees the idempotent path.
      return fail(
        'The factory key is gone and the token was not installed.',
        'failed',
        true
      );
    }
    const block = await deps.rpc.call<{ header?: { hash?: string } }>('block', {
      finality: 'final',
    });
    const blockHash = block.header?.hash ?? '';
    if (!blockHash) {
      return fail('Could not install the token.', 'failed', true);
    }

    let signed: { signedTxBase64: string; txHash: string };
    try {
      signed = await signFinishTransaction({
        secretKey: input.secretKey,
        contractId: input.contractId,
        nonce: accessKey.nonce,
        blockHash,
        txActions: input.txActions,
      });
    } catch (error) {
      if (isNonceError(error) && attempt < SIGN_ATTEMPTS - 1) continue;
      return fail('Could not install the token.', 'failed', true);
    }

    try {
      const outcome = await deps.rpc.call<unknown>('broadcast_tx_commit', [
        signed.signedTxBase64,
      ]);
      const failure = outcomeFailed(outcome);
      if (failure.nonce && attempt < SIGN_ATTEMPTS - 1) continue;
      if (failure.failed) {
        return fail('Could not install the token.', 'failed', true);
      }
    } catch (error) {
      if (isNonceError(error) && attempt < SIGN_ATTEMPTS - 1) continue;
      lastError = 'Could not install the token.';
      if (attempt < SIGN_ATTEMPTS - 1 && isNonceError(error)) continue;
      if (!isNonceError(error)) {
        const polled = await waitUntilFinal(
          deps.rpc,
          signed.txHash,
          input.contractId,
          deps
        );
        if (polled.ok) return { ok: true, txHash: signed.txHash };
        if (polled.nonce && attempt < SIGN_ATTEMPTS - 1) continue;
        return fail(polled.error, 'failed', !polled.nonce);
      }
      return fail(lastError, 'failed', true);
    }

    const polled = await waitUntilFinal(
      deps.rpc,
      signed.txHash,
      input.contractId,
      deps
    );
    if (polled.ok) return { ok: true, txHash: signed.txHash };
    if (polled.nonce && attempt < SIGN_ATTEMPTS - 1) continue;
    return fail(
      polled.error,
      'failed',
      polled.nonce || polled.error.includes('Timed out')
    );
  }

  return fail(lastError, 'failed', true);
}

export async function finishCreatorToken(
  input: FtFactoryFinishInput,
  deps: FinishCreatorTokenDeps
): Promise<FinishCreatorTokenResult> {
  const validated = validateFinishInput(input);
  if (!('value' in validated)) return validated;
  const body = validated.value;

  const key = factoryKeyFromSecret(deps.secretKey);
  if (!key) return fail(FT_FACTORY_NOT_READY, 'not-ready', false);
  if (!deps.template) {
    return fail('Token template is not configured.', 'not-ready', false);
  }

  const parent = immediateParentAccountId(body.contractId);
  if (!parent) {
    return fail('That token account id is not valid.', 'invalid', false);
  }

  let expectedCodeHash: string;
  try {
    expectedCodeHash = await expectedTemplateHash(deps.rpc, deps.template);
  } catch (error) {
    if (
      errorText(error) === FT_FACTORY_NOT_READY ||
      isAbsentChainRecord(error)
    ) {
      return fail(FT_FACTORY_NOT_READY, 'not-ready', true);
    }
    return fail('Could not verify the token template.', 'failed', true);
  }

  let createStatus: unknown;
  try {
    createStatus = await deps.rpc.call('EXPERIMENTAL_tx_status', [
      body.createTxHash,
      parent,
    ]);
  } catch (error) {
    if (isUnknownTransaction(error) || isAbsentChainRecord(error)) {
      return fail('The account transaction is not final yet.', 'failed', true);
    }
    return fail('Could not read the account transaction.', 'failed', true);
  }

  const verified = verifyCreateTransaction({
    status: createStatus,
    contractId: body.contractId,
    factoryPublicKey: key.publicKey,
  });
  if (!verified.ok) {
    return fail(
      verified.error,
      verified.retryable ? 'failed' : 'invalid',
      verified.retryable
    );
  }

  let installedHash: string | null;
  let accessKey: { present: boolean; nonce: bigint | null };
  try {
    accessKey = await factoryKeyOnAccount(
      deps.rpc,
      body.contractId,
      key.publicKey
    );
    installedHash = await readInstalledCode(deps.rpc, body.contractId);
  } catch {
    return fail('Could not read the token account.', 'failed', true);
  }

  let initialized = false;
  if (installedHash) {
    try {
      initialized = await tokenInitialized(deps.rpc, body.contractId);
    } catch {
      return fail('Could not read the token account.', 'failed', true);
    }
  }

  const plan = decideFinishPlan({
    codeHash: installedHash,
    expectedCodeHash,
    factoryKeyPresent: accessKey.present,
    initialized,
  });

  if (plan.kind === 'done') {
    return { ok: true, txHash: body.createTxHash };
  }
  if (plan.kind === 'stop') {
    return fail(plan.error, plan.code, plan.retryable);
  }

  let txActions: Action[];
  try {
    txActions = buildFinishActions({
      template: deps.template,
      publicKey: PublicKey.from(key.publicKey),
      ownerId: verified.value.ownerId,
      name: body.name,
      symbol: body.symbol,
      totalSupply: body.totalSupply,
      icon: body.icon,
      includeDeploy: plan.includeDeploy,
      includeInit: plan.includeInit,
    });
  } catch {
    return fail('Token template is not configured.', 'not-ready', false);
  }

  const broadcast = await broadcastFinish(deps, {
    secretKey: key.secretKey,
    contractId: body.contractId,
    publicKey: key.publicKey,
    txActions,
  });
  if (!broadcast.ok) return broadcast;

  try {
    const after = await factoryKeyOnAccount(
      deps.rpc,
      body.contractId,
      key.publicKey
    );
    if (after.present) {
      return fail(
        'The token install did not remove the factory key.',
        'failed',
        true
      );
    }
  } catch {
    return fail(
      'Could not confirm the factory key was removed.',
      'failed',
      true
    );
  }

  return { ok: true, txHash: broadcast.txHash };
}
