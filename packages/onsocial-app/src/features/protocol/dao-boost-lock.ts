import {
  buildBoostLockMsg,
  encodeBoostFtMsg,
  type BoostLockPeriod,
} from '@onsocial/sdk/advanced';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import {
  BOOST_ADJUST_GAS,
  BOOST_CLAIM_GAS,
  BOOST_LOCK_GAS,
  BOOST_MIN_LOCK_YOCTO,
  BOOST_UNLOCK_GAS,
} from '@/features/boost/boost-position';
import {
  BOOST_CONTRACT,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import { formatSocialCompact } from '@/lib/format-social-balance';

function encodeJsonArgs(args: unknown): string {
  const json = JSON.stringify(args);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const VALID_MONTHS = new Set([1, 6, 12, 24, 48]);

function buildDaoBoostContractCallPayload(opts: {
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit?: string;
  description: string;
}): ProtocolProposalPayload {
  return {
    proposal: {
      description: opts.description,
      kind: {
        FunctionCall: {
          receiver_id: BOOST_CONTRACT,
          actions: [
            {
              method_name: opts.methodName,
              args: encodeJsonArgs(opts.args),
              deposit: opts.deposit ?? '0',
              gas: opts.gas,
            },
          ],
        },
      },
    },
  };
}

/**
 * Build an `add_proposal` Call that locks DAO treasury SOCIAL into Boost
 * (`ft_transfer_call` → boost lock). Predecessor = DAO after approve/finalize —
 * the boost position is credited to the DAO, not the human proposer.
 */
export function buildDaoBoostLockProposalPayload(opts: {
  amountYocto: string;
  months: BoostLockPeriod;
  daoLabel?: string;
}): ProtocolProposalPayload {
  const amountYocto = opts.amountYocto.trim();
  if (!/^\d+$/.test(amountYocto) || amountYocto === '0') {
    throw new Error('Enter a valid SOCIAL amount to boost.');
  }
  if (BigInt(amountYocto) < BOOST_MIN_LOCK_YOCTO) {
    throw new Error('Amount is below the Boost minimum.');
  }
  if (!VALID_MONTHS.has(opts.months)) {
    throw new Error('Choose a valid lock period.');
  }

  const label = opts.daoLabel?.trim() || 'DAO';
  const amountLabel = formatSocialCompact(amountYocto);

  return {
    proposal: {
      description: `Lock ${amountLabel} SOCIAL in Boost for ${opts.months} mo for ${label}.`,
      kind: {
        FunctionCall: {
          receiver_id: SOCIAL_TOKEN_CONTRACT,
          actions: [
            {
              method_name: 'ft_transfer_call',
              args: encodeJsonArgs({
                receiver_id: BOOST_CONTRACT,
                amount: amountYocto,
                msg: encodeBoostFtMsg(buildBoostLockMsg(opts.months)),
              }),
              deposit: '1',
              gas: BOOST_LOCK_GAS,
            },
          ],
        },
      },
    },
  };
}

/** Claim accrued Boost rewards into the DAO wallet (predecessor = DAO). */
export function buildDaoBoostCollectProposalPayload(opts?: {
  daoLabel?: string;
  amountLabel?: string;
}): ProtocolProposalPayload {
  const label = opts?.daoLabel?.trim() || 'DAO';
  const amount = opts?.amountLabel?.trim();
  return buildDaoBoostContractCallPayload({
    methodName: 'claim_rewards',
    args: {},
    gas: BOOST_CLAIM_GAS,
    description: amount
      ? `Collect ${amount} Boost rewards for ${label}.`
      : `Collect Boost rewards for ${label}.`,
  });
}

/** Unlock principal (+ collect) when the DAO lock has matured. */
export function buildDaoBoostUnlockProposalPayload(opts?: {
  daoLabel?: string;
}): ProtocolProposalPayload {
  const label = opts?.daoLabel?.trim() || 'DAO';
  return buildDaoBoostContractCallPayload({
    methodName: 'unlock',
    args: {},
    gas: BOOST_UNLOCK_GAS,
    description: `Unlock Boost position for ${label}.`,
  });
}

/** Renew the DAO lock for another period of the same length. */
export function buildDaoBoostRenewProposalPayload(opts?: {
  daoLabel?: string;
}): ProtocolProposalPayload {
  const label = opts?.daoLabel?.trim() || 'DAO';
  return buildDaoBoostContractCallPayload({
    methodName: 'renew_lock',
    args: {},
    gas: BOOST_ADJUST_GAS,
    description: `Renew Boost lock for ${label}.`,
  });
}

/** Extend the DAO lock to a longer period (no unlock gap). */
export function buildDaoBoostExtendProposalPayload(opts: {
  months: BoostLockPeriod;
  daoLabel?: string;
}): ProtocolProposalPayload {
  if (!VALID_MONTHS.has(opts.months)) {
    throw new Error('Choose a valid lock period.');
  }
  const label = opts.daoLabel?.trim() || 'DAO';
  return buildDaoBoostContractCallPayload({
    methodName: 'extend_lock',
    args: { months: opts.months },
    gas: BOOST_ADJUST_GAS,
    description: `Extend Boost lock to ${opts.months} mo for ${label}.`,
  });
}
