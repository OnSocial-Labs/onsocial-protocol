// ft_on_transfer msg builders for the boost contract.
//
// boost-onsocial does not use a unified `Action` enum like core/scarces.
// Instead, NEP-141 transfers carry a JSON `msg` payload that the contract
// parses inside `ft_on_transfer`. These helpers emit the exact JSON shapes
// the contract accepts, so callers don't have to hand-construct strings.
//
// See: contracts/boost-onsocial/src/lib.rs (ft_on_transfer match arms).

/** Valid lock periods accepted by the boost contract (months). */
export const BOOST_LOCK_PERIODS = [1, 6, 12, 24, 48] as const;
export type BoostLockPeriod = (typeof BOOST_LOCK_PERIODS)[number];

export type BoostFtMsg =
  | { action: 'lock'; months: BoostLockPeriod }
  | { action: 'credits' }
  | { action: 'fund_scheduled' };

/**
 * Build the `msg` object for a SOCIAL `ft_transfer_call` that locks tokens
 * into a boost position. `months` must be one of `BOOST_LOCK_PERIODS`.
 */
export function buildBoostLockMsg(months: BoostLockPeriod): BoostFtMsg {
  if (!BOOST_LOCK_PERIODS.includes(months)) {
    throw new Error(
      `Invalid boost lock period: ${months}. Allowed: ${BOOST_LOCK_PERIODS.join(', ')}`,
    );
  }
  return { action: 'lock', months };
}

/** Build the `msg` for an infra-credits purchase. */
export function buildBoostCreditsMsg(): BoostFtMsg {
  return { action: 'credits' };
}

/** Build the `msg` to fund the scheduled-release reward pool (owner-only). */
export function buildBoostFundScheduledMsg(): BoostFtMsg {
  return { action: 'fund_scheduled' };
}

/** Convenience: stringify an `ft_transfer_call` msg. */
export function encodeBoostFtMsg(msg: BoostFtMsg): string {
  return JSON.stringify(msg);
}
