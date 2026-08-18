import {
  buildBoostLockMsg,
  encodeBoostFtMsg,
  type BoostLockPeriod,
} from '@onsocial/sdk/advanced';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import { BOOST_LOCK_GAS, BOOST_MIN_LOCK_YOCTO } from '@/features/boost/boost-position';
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
