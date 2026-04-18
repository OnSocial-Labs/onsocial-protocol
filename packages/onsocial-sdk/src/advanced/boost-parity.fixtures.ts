// Boost ft_on_transfer msg parity fixtures.
//
// Boost has no `Action` enum — its entrypoint is NEP-141 `ft_on_transfer` with
// a JSON `msg` payload. The Rust round-trip test (`sdk_parity_test.rs`) reads
// each `msg` string here and re-applies the contract's parsing logic to
// confirm the SDK emits payloads the contract will accept.

import {
  BOOST_LOCK_PERIODS,
  buildBoostCreditsMsg,
  buildBoostFundScheduledMsg,
  buildBoostLockMsg,
  encodeBoostFtMsg,
} from './boost-msg.js';

export interface BoostMsgParityCase {
  name: string;
  /** `action` field expected by the contract parser. */
  expectedAction: 'lock' | 'credits' | 'fund_scheduled';
  /** For `lock`: expected `months` value. */
  expectedMonths?: number;
  /** Stringified JSON exactly as it would be passed to `ft_transfer_call`. */
  msg: string;
}

export function getBoostMsgParityCases(): BoostMsgParityCase[] {
  const cases: BoostMsgParityCase[] = [];

  for (const months of BOOST_LOCK_PERIODS) {
    cases.push({
      name: `lock ${months} months`,
      expectedAction: 'lock',
      expectedMonths: months,
      msg: encodeBoostFtMsg(buildBoostLockMsg(months)),
    });
  }

  cases.push({
    name: 'credits purchase',
    expectedAction: 'credits',
    msg: encodeBoostFtMsg(buildBoostCreditsMsg()),
  });

  cases.push({
    name: 'fund scheduled pool',
    expectedAction: 'fund_scheduled',
    msg: encodeBoostFtMsg(buildBoostFundScheduledMsg()),
  });

  return cases;
}
