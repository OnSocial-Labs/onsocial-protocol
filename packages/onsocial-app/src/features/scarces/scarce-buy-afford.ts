/**
 * Whether Buy can be paid from the wallet before the transaction opens.
 * A dollar sticker still attaches NEAR. Another coin only funds that NEAR.
 */

/** Prepaid gas for a 300 TGas buy. The deposit is separate. */
export const SCARCE_BUY_GAS_RESERVE_YOCTO = 30_000_000_000_000_000_000_000n;

export interface ScarceBuyAffordInput {
  /** NEAR this buy attaches. Null while that amount is still unknown. */
  depositYocto: bigint | null;
  /** Spendable NEAR. Null while loading or when the lookup failed. */
  nearBalanceYocto: bigint | null;
  /** True when Pay with is another coin. The swap brings the purchase NEAR. */
  payWithToken: boolean;
  /** Quoted token in smallest units. Null while the quote is loading or failed. */
  tokenAmountIn: bigint | null;
  tokenBalance: bigint | null;
  tokenSymbol: string | null;
  tokenDecimals: number;
  /**
   * Coin the buyer can switch to. Named when there is one (`USDC`),
   * otherwise `another coin`.
   */
  otherPayLabel: string | null;
}

export interface ScarceBuyAfford {
  /** Disable Buy only when the check knows this payment cannot cover it. */
  blocked: boolean;
  hint: string | null;
}

const OPEN: ScarceBuyAfford = { blocked: false, hint: null };

function spokenUnits(amount: bigint, decimals: number): string {
  if (amount <= 0n || decimals < 0) return '0';
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const frac = (amount % scale)
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  const plain = frac ? `${whole}.${frac}` : whole.toString();
  const asNumber = Number(plain);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return plain;
  const compact = asNumber.toLocaleString('en-US', {
    maximumFractionDigits: 4,
  });
  return compact === '0' ? plain : compact;
}

function nearShortfallHint(
  shortfall: bigint,
  nearBalanceYocto: bigint,
  otherPayLabel: string | null
): string {
  const spoken = spokenUnits(shortfall, 24);
  const canSwitch =
    otherPayLabel && nearBalanceYocto >= SCARCE_BUY_GAS_RESERVE_YOCTO;
  return canSwitch
    ? `Need ${spoken} NEAR more. Or pay with ${otherPayLabel}.`
    : `Need ${spoken} NEAR more.`;
}

export function scarceBuyAfford(input: ScarceBuyAffordInput): ScarceBuyAfford {
  const near = input.nearBalanceYocto;
  const feesShort = near != null && near < SCARCE_BUY_GAS_RESERVE_YOCTO;

  if (input.payWithToken) {
    if (
      input.tokenAmountIn == null ||
      input.tokenBalance == null ||
      !input.tokenSymbol
    ) {
      return OPEN;
    }
    if (input.tokenBalance < input.tokenAmountIn) {
      const shortfall = input.tokenAmountIn - input.tokenBalance;
      const spoken = spokenUnits(shortfall, input.tokenDecimals);
      return {
        blocked: true,
        hint: `Need ${spoken} ${input.tokenSymbol} more.`,
      };
    }
    if (near == null) return OPEN;
    if (feesShort) {
      return { blocked: true, hint: 'Keep a little NEAR for fees.' };
    }
    return OPEN;
  }

  if (input.depositYocto == null || near == null) return OPEN;

  if (input.depositYocto === 0n) {
    return feesShort
      ? { blocked: true, hint: 'Keep a little NEAR for fees.' }
      : OPEN;
  }

  const needed = input.depositYocto + SCARCE_BUY_GAS_RESERVE_YOCTO;
  if (near >= needed) return OPEN;
  return {
    blocked: true,
    hint: nearShortfallHint(needed - near, near, input.otherPayLabel),
  };
}
