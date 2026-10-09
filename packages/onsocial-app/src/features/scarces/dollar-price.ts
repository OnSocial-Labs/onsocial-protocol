/**
 * Dollar sticker math. Matches `yocto_for_usd` in scarces-onsocial.
 * One NEAR is `price * 10^expo` dollars. `usdE6` is millionths of a dollar.
 */

import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract, yoctoToNear } from '@/lib/app-near-rpc';

export const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export const WRAP_NEAR_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'wrap.near' : 'wrap.testnet';

/** Buyer's transaction gas. The oracle request and the settle callback share 300 TGas. */
export const DOLLAR_PURCHASE_GAS = '300000000000000';

/** Fetch fee the oracle charges per price request, attached to every buy. */
export const ORACLE_CALL_FEE = 10n ** 22n;

export type DollarScope = 'sale' | 'lazy' | 'collection';

export interface DollarSticker {
  usdE6: bigint;
  minNear: bigint;
}

export interface DollarOracle {
  oracleContract: string;
  assetId: string;
  maxAgeSeconds: number;
}

/** Indicative NEAR/USD, oracle-shaped: one NEAR is `price * 10^expo` dollars. */
export interface NearUsdQuote {
  price: bigint;
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

/** Buyer stop: 0.5% above the computed NEAR, rounded up. */
export function buyerMaxNear(unitYocto: bigint, quantity = 1): bigint {
  if (quantity < 1) throw new Error('Quantity must be at least 1');
  const total = unitYocto * BigInt(quantity);
  const buffered = (total * 1005n + 999n) / 1000n;
  return buffered > total ? buffered : total + 1n;
}

/** Spoken NEAR for a dollar sticker at an indicative quote. The chain oracle still settles. */
export function dollarNearEstimateLabel(
  unitYocto: bigint,
  quantity = 1
): string {
  const total = unitYocto * BigInt(Math.max(1, quantity));
  const near = yoctoToNear(total.toString());
  const amount = Number(near);
  const spoken =
    Number.isFinite(amount) && amount >= 0.0001
      ? amount.toLocaleString('en-US', { maximumFractionDigits: 4 })
      : near;
  return `About ${spoken} NEAR now.`;
}

/** Indexed `usd_e6` millionths. Blank when the listing is priced in NEAR. */
export function dollarStickerLabel(
  usdE6: string | null | undefined
): string | null {
  if (!usdE6 || !/^\d+$/.test(usdE6)) return null;
  const value = BigInt(usdE6);
  if (value <= 0n) return null;
  return formatUsdE6(value);
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
    oracle_contract?: unknown;
    asset_id?: unknown;
    max_age_seconds?: unknown;
  };
  if (typeof row.oracle_contract !== 'string' || !row.oracle_contract)
    return null;
  if (typeof row.asset_id !== 'string' || !row.asset_id) return null;
  const maxAgeSeconds = Number(row.max_age_seconds);
  if (!Number.isFinite(maxAgeSeconds)) return null;
  return {
    oracleContract: row.oracle_contract,
    assetId: row.asset_id,
    maxAgeSeconds,
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

/** Decimal dollars to the oracle shape: "4.79" is price 479000000, expo -8. */
export function usdToOraclePrice(priceUsd: string): NearUsdQuote {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(priceUsd.trim());
  if (!match) throw new Error('NEAR price is unavailable');
  const frac = (match[2] ?? '').padEnd(8, '0').slice(0, 8);
  const price = BigInt(`${match[1]}${frac}`);
  if (price <= 0n) throw new Error('NEAR price is unavailable');
  return { price, expo: -8 };
}

/**
 * Indicative NEAR/USD for the buyer stop. The contract's oracle is
 * authoritative; this quote only sizes `max_near` and the NEAR estimate.
 */
export async function fetchNearUsdQuote(): Promise<NearUsdQuote> {
  const response = await fetch('/api/onapi/intents/near-usd');
  if (!response.ok) throw new Error('NEAR price is unavailable');
  const body = (await response.json()) as { priceUsd?: string };
  if (!body.priceUsd) throw new Error('NEAR price is unavailable');
  return usdToOraclePrice(body.priceUsd);
}

export function dollarPurchaseDeposit(maxNear: bigint): string {
  return (maxNear + ORACLE_CALL_FEE).toString();
}
