/**
 * Buy a dollar-priced scarce.
 *
 * The price is the Pyth NEAR/USD update submitted with `purchase_dollar`.
 * Another coin only funds that NEAR: 1Click delivers wrapped NEAR, the buyer
 * unwraps it, then this purchase spends native NEAR. 1Click settles on
 * mainnet, so that funding path is mainnet-only.
 */

import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  extractNearTransactionHashes,
  normalizeFtBalanceYocto,
  viewNearContract,
} from '@/lib/app-near-rpc';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import {
  DOLLAR_PURCHASE_GAS,
  SCARCES_CONTRACT,
  WRAP_NEAR_CONTRACT,
  buyerMaxNear,
  dollarPurchaseDeposit,
  fetchNearUsdUpdate,
  fetchPythUpdateFee,
  yoctoForUsd,
  type DollarOracle,
  type DollarScope,
  type DollarSticker,
} from '@/features/scarces/dollar-price';

const FT_TRANSFER_GAS = '30000000000000';
const UNWRAP_GAS = '50000000000000';
const SWAP_POLL_MS = 3000;
const SWAP_POLL_LIMIT = 40;

export interface DollarPayToken {
  assetId: string;
  contractId: string;
  symbol: string;
  decimals: number;
}

export interface DollarConfirmCopy {
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
}

export interface PurchaseDollarScarceInput {
  wallet: NearWalletBase;
  accountId: string;
  scope: DollarScope;
  id: string;
  quantity: number;
  sticker: DollarSticker;
  oracle: DollarOracle;
  /** `near` spends the wallet's NEAR. Any other value is a 1Click nep141 asset id. */
  payAssetId?: string | null;
  confirm: (txHashes: string[], copy: DollarConfirmCopy) => Promise<boolean>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nearChainPayTokens(tokens: unknown): DollarPayToken[] {
  if (!Array.isArray(tokens)) return [];
  const wrap = `nep141:${WRAP_NEAR_CONTRACT}`;
  const out: DollarPayToken[] = [];
  for (const row of tokens) {
    if (!row || typeof row !== 'object') continue;
    const token = row as {
      assetId?: string;
      blockchain?: string;
      symbol?: string;
      decimals?: number;
    };
    const assetId = token.assetId ?? '';
    if (token.blockchain !== 'near') continue;
    if (!assetId.startsWith('nep141:')) continue;
    if (assetId === wrap || assetId === 'nep141:wrap.near') continue;
    const contractId = assetId.slice('nep141:'.length);
    if (!contractId || !token.symbol) continue;
    out.push({
      assetId,
      contractId,
      symbol: token.symbol,
      decimals: token.decimals ?? 0,
    });
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function signCall(opts: {
  wallet: NearWalletBase;
  accountId: string;
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}): Promise<string[]> {
  const result = await opts.wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId: opts.accountId,
    receiverId: opts.receiverId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: opts.methodName,
          args: opts.args,
          gas: opts.gas,
          deposit: opts.deposit,
        },
      },
    ],
  });
  return extractNearTransactionHashes(result);
}

async function quoteExactNear(opts: {
  originAsset: string;
  amountOutYocto: string;
  recipient: string;
}): Promise<{ amountIn: string; depositAddress: string }> {
  const response = await fetch('/api/onapi/intents/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      originAsset: opts.originAsset,
      amountOutYocto: opts.amountOutYocto,
      recipient: opts.recipient,
      refundTo: opts.recipient,
      dry: false,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    quote?: { amountIn?: string; depositAddress?: string };
  } | null;
  if (!response.ok) {
    throw new Error(body?.error || 'Quote was refused');
  }
  const amountIn = body?.quote?.amountIn;
  const depositAddress = body?.quote?.depositAddress;
  if (!amountIn || !depositAddress) throw new Error('Quote was refused');
  return { amountIn, depositAddress };
}

async function waitForSwap(depositAddress: string): Promise<void> {
  for (let attempt = 0; attempt < SWAP_POLL_LIMIT; attempt += 1) {
    await sleep(SWAP_POLL_MS);
    const response = await fetch(
      `/api/onapi/intents/status?depositAddress=${encodeURIComponent(depositAddress)}`
    );
    if (!response.ok) continue;
    const body = (await response.json()) as { status?: string };
    if (body.status === 'SUCCESS') return;
    if (
      body.status === 'REFUNDED' ||
      body.status === 'FAILED' ||
      body.status === 'INCOMPLETE_DEPOSIT'
    ) {
      throw new Error('Swap did not finish');
    }
  }
  throw new Error('Swap is still pending');
}

async function ftBalance(
  contractId: string,
  accountId: string
): Promise<bigint> {
  const value = await viewNearContract<unknown>(contractId, 'ft_balance_of', {
    account_id: accountId,
  });
  return normalizeFtBalanceYocto(value);
}

async function fundWithToken(
  input: PurchaseDollarScarceInput,
  amountOutYocto: string
): Promise<void> {
  if (ACTIVE_NEAR_NETWORK !== 'mainnet') {
    throw new Error('Other coins fund NEAR on mainnet');
  }
  const originAsset = input.payAssetId!;
  const quote = await quoteExactNear({
    originAsset,
    amountOutYocto,
    recipient: input.accountId,
  });
  const before = await ftBalance(WRAP_NEAR_CONTRACT, input.accountId);
  const contractId = originAsset.slice('nep141:'.length);
  const swapHashes = await signCall({
    wallet: input.wallet,
    accountId: input.accountId,
    receiverId: contractId,
    methodName: 'ft_transfer',
    args: {
      receiver_id: quote.depositAddress,
      amount: quote.amountIn,
      memo: 'OnSocial scarce',
    },
    gas: FT_TRANSFER_GAS,
    deposit: '1',
  });
  const swapped = await input.confirm(swapHashes, {
    submittedMessage: txToastConfirming.fundingNear,
    successMessage: txToastSuccess.nearFunded,
    failureMessage: txToastError.fundNearFailed,
  });
  if (!swapped) throw new Error('Swap was not confirmed');
  await waitForSwap(quote.depositAddress);
  const after = await ftBalance(WRAP_NEAR_CONTRACT, input.accountId);
  const received = after > before ? after - before : 0n;
  if (received <= 0n) throw new Error('Wrapped NEAR did not arrive');
  const unwrapHashes = await signCall({
    wallet: input.wallet,
    accountId: input.accountId,
    receiverId: WRAP_NEAR_CONTRACT,
    methodName: 'near_withdraw',
    args: { amount: received.toString() },
    gas: UNWRAP_GAS,
    deposit: '1',
  });
  const unwrapped = await input.confirm(unwrapHashes, {
    submittedMessage: txToastConfirming.unwrappingNear,
    successMessage: txToastSuccess.nearUnwrapped,
    failureMessage: txToastError.unwrapNearFailed,
  });
  if (!unwrapped) throw new Error('Unwrap was not confirmed');
}

export async function purchaseDollarScarce(
  input: PurchaseDollarScarceInput
): Promise<boolean> {
  const update = await fetchNearUsdUpdate();
  const unit = yoctoForUsd(input.sticker.usdE6, update.price, update.expo);
  if (input.sticker.minNear > 0n && unit < input.sticker.minNear) {
    throw new Error('NEAR price is below the seller minimum');
  }
  const maxNear = buyerMaxNear(unit, input.quantity);
  const pythFee = await fetchPythUpdateFee(
    input.oracle.pythContract,
    update.updateData
  );
  if (input.payAssetId && input.payAssetId !== 'near') {
    await fundWithToken(input, maxNear.toString());
  }
  const hashes = await signCall({
    wallet: input.wallet,
    accountId: input.accountId,
    receiverId: SCARCES_CONTRACT,
    methodName: 'purchase_dollar',
    args: {
      scope: input.scope,
      id: input.id,
      quantity: input.quantity,
      max_near: maxNear.toString(),
      pyth_fee: pythFee.toString(),
      update_data: update.updateData,
    },
    gas: DOLLAR_PURCHASE_GAS,
    deposit: dollarPurchaseDeposit(maxNear, pythFee),
  });
  return input.confirm(hashes, {
    submittedMessage: txToastConfirming.buyingScarce,
    successMessage: txToastSuccess.scarcePurchased,
    failureMessage: txToastError.buyScarceFailed,
  });
}
