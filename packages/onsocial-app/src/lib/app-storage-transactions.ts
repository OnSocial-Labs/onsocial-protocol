import { CORE_CONTRACT } from '@/lib/app-near-contract';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import type { NearWalletBase } from '@hot-labs/near-connect';

const STORAGE_ADMIN_GAS = '300000000000000';
/** Matches integration tests — share_storage is lighter than pool deposit. */
const STORAGE_SHARE_GAS = '100000000000000';
/** Stay under the ~300 TGas NEAR tx cap when batching multiple share actions. */
const STORAGE_SHARE_BATCH_MAX = 2;

export interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
}

function buildExecuteAdminAction(
  storagePath: string,
  value: Record<string, unknown>,
  gas = STORAGE_ADMIN_GAS
) {
  return {
    methodName: 'execute_admin',
    args: {
      request: {
        action: {
          type: 'set',
          data: { [storagePath]: value },
        },
      },
    },
    gas,
    deposit: '0',
  };
}

export async function sendStorageDepositTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  amountYocto: string
): Promise<string[]> {
  const { wallet, accountId: signerId } = await getSigningWallet();
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: CORE_CONTRACT,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'execute_admin',
          args: {
            request: {
              action: {
                type: 'set',
                data: {
                  'storage/deposit': { amount: amountYocto },
                },
              },
            },
          },
          gas: STORAGE_ADMIN_GAS,
          deposit: amountYocto,
        },
      },
    ],
  });

  return extractNearTransactionHashes(result);
}

export async function sendStorageWithdrawTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  amountYocto?: string
): Promise<string[]> {
  const withdrawData =
    amountYocto && amountYocto !== '0'
      ? { amount: amountYocto }
      : ({} as Record<string, never>);

  const action = buildExecuteAdminAction('storage/withdraw', withdrawData);
  const { wallet, accountId: signerId } = await getSigningWallet();
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: CORE_CONTRACT,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: action.methodName,
          args: action.args,
          gas: action.gas,
          deposit: action.deposit,
        },
      },
    ],
  });

  return extractNearTransactionHashes(result);
}

export async function sendStorageSharedPoolDepositTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  poolAccountId: string,
  amountYocto: string
): Promise<string[]> {
  const { wallet, accountId: signerId } = await getSigningWallet();
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: CORE_CONTRACT,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'execute_admin',
          args: {
            request: {
              action: {
                type: 'set',
                data: {
                  'storage/shared_pool_deposit': {
                    pool_id: poolAccountId,
                    amount: amountYocto,
                  },
                },
              },
            },
          },
          gas: STORAGE_ADMIN_GAS,
          deposit: amountYocto,
        },
      },
    ],
  });

  return extractNearTransactionHashes(result);
}

export async function sendStorageShareBatchTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  recipients: Array<{ targetAccountId: string; maxBytes: number }>
): Promise<string[]> {
  if (recipients.length === 0) {
    return [];
  }

  const txHashes: string[] = [];

  for (
    let index = 0;
    index < recipients.length;
    index += STORAGE_SHARE_BATCH_MAX
  ) {
    const chunk = recipients.slice(index, index + STORAGE_SHARE_BATCH_MAX);
    const { wallet, accountId: signerId } = await getSigningWallet();
    const result = await wallet.signAndSendTransaction({
      network: ACTIVE_NEAR_NETWORK,
      signerId,
      receiverId: CORE_CONTRACT,
      actions: chunk.map(({ targetAccountId, maxBytes }) => ({
        type: 'FunctionCall',
        params: {
          methodName: 'execute_admin',
          args: {
            request: {
              action: {
                type: 'set',
                data: {
                  'storage/share_storage': {
                    target_id: targetAccountId,
                    max_bytes: maxBytes,
                  },
                },
              },
            },
          },
          gas: STORAGE_SHARE_GAS,
          deposit: '0',
        },
      })),
    });

    txHashes.push(...extractNearTransactionHashes(result));
  }

  return txHashes;
}

export async function sendGroupPoolDepositTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  groupId: string,
  amountYocto: string
): Promise<string[]> {
  const { wallet, accountId: signerId } = await getSigningWallet();
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: CORE_CONTRACT,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'execute_admin',
          args: {
            request: {
              action: {
                type: 'set',
                data: {
                  'storage/group_pool_deposit': {
                    group_id: groupId,
                    amount: amountYocto,
                  },
                },
              },
            },
          },
          gas: STORAGE_ADMIN_GAS,
          deposit: amountYocto,
        },
      },
    ],
  });

  return extractNearTransactionHashes(result);
}

export async function sendGroupSponsorQuotaBatchTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  groupId: string,
  recipients: Array<{ targetAccountId: string; maxBytes: number }>
): Promise<string[]> {
  if (recipients.length === 0) {
    return [];
  }

  const txHashes: string[] = [];

  for (
    let index = 0;
    index < recipients.length;
    index += STORAGE_SHARE_BATCH_MAX
  ) {
    const chunk = recipients.slice(index, index + STORAGE_SHARE_BATCH_MAX);
    const { wallet, accountId: signerId } = await getSigningWallet();
    const result = await wallet.signAndSendTransaction({
      network: ACTIVE_NEAR_NETWORK,
      signerId,
      receiverId: CORE_CONTRACT,
      actions: chunk.map(({ targetAccountId, maxBytes }) => ({
        type: 'FunctionCall',
        params: {
          methodName: 'execute_admin',
          args: {
            request: {
              action: {
                type: 'set',
                data: {
                  'storage/group_sponsor_quota_set': {
                    group_id: groupId,
                    target_id: targetAccountId,
                    enabled: true,
                    daily_refill_bytes: 0,
                    allowance_max_bytes: maxBytes,
                  },
                },
              },
            },
          },
          gas: STORAGE_SHARE_GAS,
          deposit: '0',
        },
      })),
    });

    txHashes.push(...extractNearTransactionHashes(result));
  }

  return txHashes;
}
