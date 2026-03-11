/**
 * Generic token-amount utilities
 *
 * All functions are decimal-parametric — they work with any token,
 * not just NEAR. Pass `decimals` from the Token object.
 *
 * @module onsocial-intents/utils
 */

/**
 * Parse a human-readable amount into the smallest on-chain unit.
 *
 * @param human    — e.g. `"1.5"`
 * @param decimals — token decimals (24 for NEAR, 6 for USDC, etc.)
 * @returns Amount in smallest units, e.g. `"1500000000000000000000000"`
 *
 * @example
 * ```ts
 * parseAmount('1.5', 24);  // "1500000000000000000000000"  (NEAR)
 * parseAmount('50', 6);    // "50000000"                    (USDC)
 * ```
 */
export function parseAmount(human: string, decimals: number): string {
  const [whole = '0', frac = ''] = human.split('.');
  const padded = frac.padEnd(decimals, '0').slice(0, decimals);
  const multiplier = BigInt(10) ** BigInt(decimals);
  return (BigInt(whole) * multiplier + BigInt(padded)).toString();
}

/**
 * Format an on-chain amount into a human-readable string.
 *
 * @param raw         — amount in smallest units
 * @param decimals    — token decimals
 * @param maxDisplay  — max decimal places shown (default: `min(decimals, 6)`)
 *
 * @example
 * ```ts
 * formatAmount('1500000000000000000000000', 24);    // "1.500000"
 * formatAmount('50000000', 6, 2);                    // "50.00"
 * ```
 */
export function formatAmount(
  raw: string,
  decimals: number,
  maxDisplay?: number
): string {
  const display = maxDisplay ?? Math.min(decimals, 6);
  const divisor = 10 ** decimals;
  const num = parseFloat(raw) / divisor;
  return num.toFixed(display);
}

/**
 * Build an asset ID from chain prefix + contract address.
 *
 * @example
 * ```ts
 * formatAssetId('nep141', 'wrap.near');                // "nep141:wrap.near"
 * formatAssetId('nep141', 'usdc.e.near');              // "nep141:usdc.e.near"
 * ```
 */
export function formatAssetId(prefix: string, contractAddress: string): string {
  return `${prefix}:${contractAddress}`;
}

/**
 * Parse an asset ID back into `{ prefix, address }`.
 *
 * @example
 * ```ts
 * parseAssetId('nep141:wrap.near');  // { prefix: 'nep141', address: 'wrap.near' }
 * parseAssetId('near');              // { prefix: 'near',   address: 'near' }
 * ```
 */
export function parseAssetId(assetId: string): {
  prefix: string;
  address: string;
} {
  const idx = assetId.indexOf(':');
  if (idx === -1) return { prefix: assetId, address: assetId };
  return { prefix: assetId.slice(0, idx), address: assetId.slice(idx + 1) };
}

/**
 * Check whether a status string is terminal (swap is done, one way or another).
 */
export function isTerminalStatus(status: string): boolean {
  return status === 'SUCCESS' || status === 'FAILED' || status === 'REFUNDED';
}
