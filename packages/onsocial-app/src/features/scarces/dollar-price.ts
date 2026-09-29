/**
 * Dollar sticker math. Matches `yocto_for_usd` in scarces-onsocial.
 * One NEAR is `price * 10^expo` dollars. `usdE6` is millionths of a dollar.
 */

import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';

export const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export const WRAP_NEAR_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'wrap.near' : 'wrap.testnet';

/** Buyer's transaction gas. Pyth's update and the settle callback share 300 TGas. */
export const DOLLAR_PURCHASE_GAS = '300000000000000';

export type DollarScope = 'sale' | 'lazy' | 'collection';

export interface DollarSticker {
  usdE6: bigint;
  minNear: bigint;
}

export interface DollarOracle {
  pythContract: string;
  priceId: string;
  maxAgeSeconds: number;
  maxConfBps: number;
}

export interface NearUsdUpdate {
  updateData: string;
  price: bigint;
  conf: bigint;
  expo: number;
}

export function yoctoForUsd(
  usdE6: bigint,
  price: bigint,
  expo: number
): bigint {
  if (usdE6 <= 0n || price <= 0n) {
    throw new Error('Dollar price and NEAR price must be greater than 0');
  }
  if (expo > 18) {
    throw new Error('NEAR price exponent is not usable');
  }
  const scalePow = 18 - expo;
  let scale = 1n;
  for (let i = 0; i < scalePow; i += 1) scale *= 10n;
  const yocto = (usdE6 * scale) / price;
  if (yocto <= 0n) throw new Error('Dollar price converts to 0 NEAR');
  return yocto;
}

/** 1% above the computed NEAR, rounded up, so a small move still clears. */
export function buyerMaxNear(unitYocto: bigint, quantity = 1): bigint {
  if (quantity < 1) throw new Error('Quantity must be at least 1');
  const total = unitYocto * BigInt(quantity);
  const buffered = (total * 101n + 99n) / 100n;
  return buffered > total ? buffered : total + 1n;
}

export function formatUsdE6(usdE6: bigint, quantity = 1): string {
  const total = usdE6 * BigInt(Math.max(1, quantity));
  const whole = total / 1_000_000n;
  const frac = (total % 1_000_000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  return frac ? `$${whole.toString()}.${frac}` : `$${whole.toString()}`;
}

export function parseU128(value: unknown): bigint | null {
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (value && typeof value === 'object' && '0' in value) {
    return parseU128((value as { 0?: unknown })['0']);
  }
  return null;
}

export function parseDollarSticker(value: unknown): DollarSticker | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { usd_e6?: unknown; min_near?: unknown };
  const usdE6 = parseU128(row.usd_e6);
  const minNear = parseU128(row.min_near);
  if (usdE6 == null || usdE6 <= 0n || minNear == null) return null;
  return { usdE6, minNear };
}

export function parseDollarOracle(value: unknown): DollarOracle | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as {
    pyth_contract?: unknown;
    price_id?: unknown;
    max_age_seconds?: unknown;
    max_conf_bps?: unknown;
  };
  if (typeof row.pyth_contract !== 'string' || !row.pyth_contract) return null;
  if (typeof row.price_id !== 'string' || row.price_id.length !== 64)
    return null;
  const maxAgeSeconds = Number(row.max_age_seconds);
  const maxConfBps = Number(row.max_conf_bps);
  if (!Number.isFinite(maxAgeSeconds) || !Number.isFinite(maxConfBps))
    return null;
  return {
    pythContract: row.pyth_contract,
    priceId: row.price_id,
    maxAgeSeconds,
    maxConfBps,
  };
}

export async function fetchDollarSticker(
  scope: DollarScope,
  id: string
): Promise<DollarSticker | null> {
  const value = await viewNearContract<unknown>(
    SCARCES_CONTRACT,
    'get_dollar_price',
    { scope, id }
  );
  return parseDollarSticker(value);
}

export async function fetchDollarOracle(): Promise<DollarOracle | null> {
  const value = await viewNearContract<unknown>(
    SCARCES_CONTRACT,
    'get_dollar_oracle',
    {}
  );
  return parseDollarOracle(value);
}

export async function fetchNearUsdUpdate(): Promise<NearUsdUpdate> {
  const response = await fetch('/api/onapi/intents/near-usd');
  if (!response.ok) throw new Error('NEAR price is unavailable');
  const body = (await response.json()) as {
    updateData?: string;
    price?: string;
    conf?: string;
    expo?: number;
  };
  const updateData = body.updateData?.replace(/^0x/, '') ?? '';
  const price = body.price ? BigInt(body.price) : 0n;
  if (!updateData || price <= 0n || body.expo == null) {
    throw new Error('NEAR price is unavailable');
  }
  return {
    updateData,
    price,
    conf: BigInt(body.conf ?? '0'),
    expo: body.expo,
  };
}

export async function fetchPythUpdateFee(
  pythContract: string,
  updateData: string
): Promise<bigint> {
  const value = await viewNearContract<unknown>(
    pythContract,
    'get_update_fee_estimate',
    { data: updateData }
  );
  const fee = parseU128(value);
  if (fee == null) throw new Error('Pyth update fee is unavailable');
  return fee;
}

export function dollarPurchaseDeposit(
  maxNear: bigint,
  pythFee: bigint
): string {
  return (maxNear + pythFee).toString();
}
