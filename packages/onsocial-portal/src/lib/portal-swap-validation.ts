import {
  PORTAL_SWAP_NEAR_GAS_RESERVE_YOCTO,
  PORTAL_SWAP_WNEAR_STORAGE_BUFFER_YOCTO,
  type PortalSwapInputKind,
} from '@/lib/portal-swap-config';

const NEAR_YOCTO = 10n ** 24n;
const USDC_DECIMALS = 6n;
const USDC_UNIT = 10n ** USDC_DECIMALS;

export type PortalSwapHint =
  | 'insufficient-input'
  | 'gas-usdc-path'
  | 'gas-near-input'
  | 'wnear-storage';

export interface PortalSwapValidationInput {
  tokenIn: PortalSwapInputKind;
  amountIn: string;
  inputBalanceYocto: string | null;
  nearBalanceYocto: string | null;
  needsWnearStorage: boolean;
  hasQuote: boolean;
  estimating: boolean;
  refreshingQuote: boolean;
  swapping: boolean;
  accountId: string | null;
  enabled: boolean;
}

export interface PortalSwapValidationResult {
  canSwap: boolean;
  hint: PortalSwapHint | null;
  maxAmount: string | null;
}

function parsePositiveYocto(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  const [whole = '0', frac = ''] = trimmed.split('.');
  const padded = frac.padEnd(24, '0').slice(0, 24);
  return BigInt(whole) * NEAR_YOCTO + BigInt(padded || '0');
}

function parsePositiveUsdc(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  const [whole = '0', frac = ''] = trimmed.split('.');
  const padded = frac
    .padEnd(Number(USDC_DECIMALS), '0')
    .slice(0, Number(USDC_DECIMALS));
  return BigInt(whole) * USDC_UNIT + BigInt(padded || '0');
}

function formatNearYocto(yocto: bigint): string {
  if (yocto <= 0n) return '0';
  const whole = yocto / NEAR_YOCTO;
  const frac = (yocto % NEAR_YOCTO)
    .toString()
    .padStart(24, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function formatUsdcAmount(amount: bigint): string {
  if (amount <= 0n) return '0';
  const whole = amount / USDC_UNIT;
  const frac = (amount % USDC_UNIT)
    .toString()
    .padStart(Number(USDC_DECIMALS), '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function portalSwapHintMessage(hint: PortalSwapHint): string {
  switch (hint) {
    case 'insufficient-input':
      return 'Not enough for this swap.';
    case 'gas-usdc-path':
      return 'Keep a little NEAR for fees.';
    case 'gas-near-input':
      return 'Leave ~0.005 NEAR for fees.';
    case 'wnear-storage':
      return 'First swap needs a small wNEAR deposit.';
  }
}

export function evaluatePortalSwapValidation(
  input: PortalSwapValidationInput
): PortalSwapValidationResult {
  const {
    tokenIn,
    amountIn,
    inputBalanceYocto,
    nearBalanceYocto,
    needsWnearStorage,
    hasQuote,
    estimating,
    refreshingQuote,
    swapping,
    accountId,
    enabled,
  } = input;

  const inputBal = inputBalanceYocto != null ? BigInt(inputBalanceYocto) : null;
  const nearBal = nearBalanceYocto != null ? BigInt(nearBalanceYocto) : null;
  const gasReserve = PORTAL_SWAP_NEAR_GAS_RESERVE_YOCTO;
  const wnearBuffer = needsWnearStorage
    ? PORTAL_SWAP_WNEAR_STORAGE_BUFFER_YOCTO
    : 0n;

  const amountYocto =
    tokenIn === 'near'
      ? parsePositiveYocto(amountIn)
      : parsePositiveUsdc(amountIn);

  let maxAmount: string | null = null;
  if (inputBal != null) {
    if (tokenIn === 'near') {
      const spendable = inputBal - gasReserve - wnearBuffer;
      maxAmount = formatNearYocto(spendable > 0n ? spendable : 0n);
    } else {
      maxAmount = formatUsdcAmount(inputBal);
    }
  }

  const baseReady =
    enabled &&
    Boolean(accountId) &&
    !estimating &&
    !refreshingQuote &&
    !swapping &&
    amountYocto != null &&
    hasQuote;

  if (!baseReady || inputBal == null || nearBal == null) {
    return { canSwap: false, hint: null, maxAmount };
  }

  let hint: PortalSwapHint | null = null;

  if (tokenIn === 'usdc') {
    if (amountYocto > inputBal) {
      hint = 'insufficient-input';
    } else if (nearBal < gasReserve) {
      hint = 'gas-usdc-path';
    }

    return {
      canSwap: baseReady && hint == null,
      hint: amountYocto != null && amountIn.trim() ? hint : null,
      maxAmount,
    };
  }

  const totalNearNeeded = amountYocto + gasReserve + wnearBuffer;

  if (amountYocto > inputBal) {
    hint = 'insufficient-input';
  } else if (totalNearNeeded > inputBal) {
    if (
      needsWnearStorage &&
      amountYocto + gasReserve + wnearBuffer > inputBal
    ) {
      hint = 'wnear-storage';
    } else if (amountYocto + gasReserve > inputBal) {
      hint = 'gas-near-input';
    } else {
      hint = 'insufficient-input';
    }
  }

  return {
    canSwap: baseReady && hint == null,
    hint: amountIn.trim() ? hint : null,
    maxAmount,
  };
}
