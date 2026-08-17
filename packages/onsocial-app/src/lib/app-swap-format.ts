/** Format raw token atomic balance for swap balance labels. */
export function formatSwapInputBalance(
  balance: string | null,
  decimals: number,
  symbol: string
): string | null {
  if (balance == null) return null;
  try {
    const refDecimals = symbol === 'NEAR' ? 24 : decimals;
    const divisor = 10n ** BigInt(refDecimals);
    const whole = BigInt(balance) / divisor;
    const frac = BigInt(balance) % divisor;
    const fracStr = frac
      .toString()
      .padStart(refDecimals, '0')
      .slice(0, 4)
      .replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return null;
  }
}
