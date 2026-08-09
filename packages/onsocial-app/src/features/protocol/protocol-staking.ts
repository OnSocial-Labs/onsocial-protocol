import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';

const STAKING_GAS = '80000000000000';
const TOKEN_TRANSFER_GAS = '100000000000000';

export type ProtocolDelegationPlan = {
  targetDelegateAmount: string;
  depositAmount: string;
  storageDeposit: string;
  delegateAmount: string;
  needsBatch: boolean;
};

export function buildProtocolDelegationPlan(
  eligibility: ProtocolGovernanceEligibility,
  targetDelegateAmount: bigint
): ProtocolDelegationPlan {
  const availableToDelegate = BigInt(eligibility.availableToDelegate);
  const depositAmount =
    targetDelegateAmount > availableToDelegate
      ? targetDelegateAmount - availableToDelegate
      : 0n;
  const storageDeposit = eligibility.isRegistered
    ? 0n
    : BigInt(eligibility.delegateActionNearStorageNeeded);

  return {
    targetDelegateAmount: targetDelegateAmount.toString(),
    depositAmount: depositAmount.toString(),
    storageDeposit: storageDeposit.toString(),
    delegateAmount: targetDelegateAmount.toString(),
    needsBatch: storageDeposit > 0n || depositAmount > 0n,
  };
}

export async function prepareProtocolDelegation(opts: {
  wallet: NearWalletBase;
  accountId: string;
  stakingContractId: string;
  storageDeposit?: string;
  depositAmount?: string;
  delegateAmount?: string;
}): Promise<string[]> {
  const {
    wallet,
    accountId,
    stakingContractId,
    storageDeposit = '0',
    depositAmount = '0',
    delegateAmount = '0',
  } = opts;

  const transactions: Array<{
    receiverId: string;
    actions: Array<{
      type: 'FunctionCall';
      params: {
        methodName: string;
        args: Record<string, unknown>;
        gas: string;
        deposit: string;
      };
    }>;
  }> = [];

  if (BigInt(storageDeposit) > 0n) {
    transactions.push({
      receiverId: stakingContractId,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'storage_deposit',
            args: {
              account_id: accountId,
              registration_only: false,
            },
            gas: STAKING_GAS,
            deposit: storageDeposit,
          },
        },
      ],
    });
  }

  if (BigInt(depositAmount) > 0n) {
    transactions.push({
      receiverId: SOCIAL_TOKEN_CONTRACT,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'ft_transfer_call',
            args: {
              receiver_id: stakingContractId,
              amount: depositAmount,
              msg: '',
            },
            gas: TOKEN_TRANSFER_GAS,
            deposit: '1',
          },
        },
      ],
    });
  }

  if (BigInt(delegateAmount) > 0n) {
    transactions.push({
      receiverId: stakingContractId,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'delegate',
            args: {
              account_id: accountId,
              amount: delegateAmount,
            },
            gas: STAKING_GAS,
            deposit: '0',
          },
        },
      ],
    });
  }

  if (transactions.length === 0) return [];

  if (transactions.length === 1) {
    const [transaction] = transactions;
    const result = await wallet.signAndSendTransaction({
      network: ACTIVE_NEAR_NETWORK,
      signerId: accountId,
      receiverId: transaction.receiverId,
      actions: transaction.actions,
    });
    return extractNearTransactionHashes(result);
  }

  const result = await wallet.signAndSendTransactions({
    network: ACTIVE_NEAR_NETWORK,
    signerId: accountId,
    transactions,
  });
  return extractNearTransactionHashes(result);
}

export async function undelegateProtocolStake(opts: {
  wallet: NearWalletBase;
  accountId: string;
  stakingContractId: string;
  amounts: string[];
}): Promise<string[]> {
  const amounts = opts.amounts.filter((amount) => BigInt(amount || '0') > 0n);
  if (amounts.length === 0) return [];
  const result = await opts.wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId: opts.accountId,
    receiverId: opts.stakingContractId,
    actions: amounts.map((amount) => ({
      type: 'FunctionCall' as const,
      params: {
        methodName: 'undelegate',
        args: {
          account_id: opts.accountId,
          amount,
        },
        gas: STAKING_GAS,
        deposit: '0',
      },
    })),
  });
  return extractNearTransactionHashes(result);
}

export async function withdrawProtocolStake(opts: {
  wallet: NearWalletBase;
  accountId: string;
  stakingContractId: string;
  amount: string;
}): Promise<string[]> {
  const result = await opts.wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId: opts.accountId,
    receiverId: opts.stakingContractId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'withdraw',
          args: { amount: opts.amount },
          gas: STAKING_GAS,
          deposit: '0',
        },
      },
    ],
  });
  return extractNearTransactionHashes(result);
}
