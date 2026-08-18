import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import { SOCIAL_SPEND_CONTRACT } from '@/lib/app-config';

/** Gas for social-spend `claim_target_balance` from a DAO Call proposal. */
export const DAO_CLAIM_SUPPORT_CALL_GAS = '100000000000000';

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

/**
 * Build an `add_proposal` Call that claims the DAO's social-spend target pot
 * (`claim_target_balance`, predecessor = DAO). Works for any DAO that received
 * profile Support — approve + finalize still required after submit.
 */
export function buildDaoClaimSupportProposalPayload(opts?: {
  /** Optional partial claim in yocto; omit to claim the full pot. */
  amountYocto?: string;
  /** Human amount for the proposal description, e.g. `12 SOCIAL`. */
  amountLabel?: string;
  daoLabel?: string;
}): ProtocolProposalPayload {
  const label = opts?.daoLabel?.trim() || 'DAO';
  const amount = opts?.amountYocto?.trim();
  const amountLabel = opts?.amountLabel?.trim();
  const args: Record<string, unknown> = {};
  if (amount && amount !== '0') {
    args.amount = amount;
  }

  return {
    proposal: {
      description: amountLabel
        ? `Claim ${amountLabel} Support for ${label}.`
        : `Claim unclaimed Support for ${label}.`,
      kind: {
        FunctionCall: {
          receiver_id: SOCIAL_SPEND_CONTRACT,
          actions: [
            {
              method_name: 'claim_target_balance',
              args: encodeJsonArgs(args),
              deposit: '0',
              gas: DAO_CLAIM_SUPPORT_CALL_GAS,
            },
          ],
        },
      },
    },
  };
}
