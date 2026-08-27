import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  buildSessionGrant,
  planToWalletTransactions,
  resolveContractId,
} from '@onsocial/sdk/advanced';
import { communityAppSessionPath } from '@onsocial/sdk';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import { viewFunctionCallAccessKey } from '@/lib/near-access-key';

export const COMMUNITY_APP_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const COMMUNITY_APP_SESSION_ALLOWANCE_YOCTO = '250000000000000000000000';

export type CommunityAppSessionGrantResult = {
  skipped: boolean;
  txHashes: string[];
};

export async function grantCommunityAppSession(input: {
  accountId: string;
  appId: string;
  publicKey: string;
  wallet: NearWalletBase;
}): Promise<CommunityAppSessionGrantResult> {
  const coreContractId = resolveContractId(ACTIVE_NEAR_NETWORK, 'core');
  if (!coreContractId) {
    throw new Error('Core contract is not configured');
  }

  const onChain = await viewFunctionCallAccessKey(
    input.accountId,
    input.publicKey
  );
  if (onChain && onChain.receiverId !== coreContractId) {
    throw new Error('This key is already granted to another contract');
  }
  if (onChain && onChain.receiverId === coreContractId) {
    return { skipped: true, txHashes: [] };
  }

  const plan = buildSessionGrant({
    network: ACTIVE_NEAR_NETWORK,
    accountId: input.accountId,
    sessionPublicKey: input.publicKey,
    contract: 'core',
    path: communityAppSessionPath(input.appId),
    ttlMs: COMMUNITY_APP_SESSION_TTL_MS,
    functionCallKey: {
      methodNames: ['execute'],
      allowanceYocto: COMMUNITY_APP_SESSION_ALLOWANCE_YOCTO,
    },
    storageDepositYocto: '0',
  });
  const transactions = planToWalletTransactions(plan);
  const result = await input.wallet.signAndSendTransactions({
    network: ACTIVE_NEAR_NETWORK,
    signerId: input.accountId,
    transactions,
  });
  return {
    skipped: false,
    txHashes: extractNearTransactionHashes(result),
  };
}
