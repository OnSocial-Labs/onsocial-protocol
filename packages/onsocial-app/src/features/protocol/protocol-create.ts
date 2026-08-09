import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  GOVERNANCE_PROPOSAL_BOND,
} from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { getProtocolProposalBond } from '@/features/protocol/protocol-eligibility';

const ADD_PROPOSAL_GAS = '300000000000000';

export interface ProtocolSignalProposalPayload {
  proposal: {
    description: string;
    kind: { Vote: null };
  };
}

export function buildProtocolSignalProposalPayload(
  description: string
): ProtocolSignalProposalPayload {
  const proposalDescription = description.trim();
  if (!proposalDescription) {
    throw new Error('Signal description is required.');
  }
  return {
    proposal: {
      description: proposalDescription,
      kind: { Vote: null },
    },
  };
}

function decodeProposalId(result: unknown): number | null {
  const successValue = (result as { status?: { SuccessValue?: string } })
    ?.status?.SuccessValue;
  if (typeof successValue !== 'string') return null;
  const decoded = atob(successValue).trim().replace(/^"|"$/g, '');
  return /^\d+$/.test(decoded) ? Number(decoded) : null;
}

export async function submitProtocolSignalProposal(opts: {
  wallet: NearWalletBase;
  accountId: string;
  daoAccountId: string;
  description: string;
}): Promise<{ proposalId: number | null; txHashes: string[] }> {
  const payload = buildProtocolSignalProposalPayload(opts.description);
  const proposalBond =
    (await getProtocolProposalBond(opts.daoAccountId).catch(() => null)) ??
    GOVERNANCE_PROPOSAL_BOND;

  const result = await opts.wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId: opts.accountId,
    receiverId: opts.daoAccountId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: payload,
          gas: ADD_PROPOSAL_GAS,
          deposit: proposalBond,
        },
      },
    ],
  });

  return {
    proposalId: decodeProposalId(result),
    txHashes: extractNearTransactionHashes(result),
  };
}
