import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import type { ProtocolDaoAction } from '@/features/protocol/types';

const DAO_ACT_PROPOSAL_GAS = '300000000000000';

export async function actOnProtocolProposal(opts: {
  wallet: NearWalletBase;
  accountId: string;
  daoAccountId: string;
  proposalId: number;
  action: ProtocolDaoAction;
  proposalKind: Record<string, unknown>;
}): Promise<string[]> {
  const result = await opts.wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId: opts.accountId,
    receiverId: opts.daoAccountId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'act_proposal',
          args: {
            id: opts.proposalId,
            action: opts.action,
            proposal: opts.proposalKind,
          },
          gas: DAO_ACT_PROPOSAL_GAS,
          deposit: '0',
        },
      },
    ],
  });
  return extractNearTransactionHashes(result);
}
