import { CORE_CONTRACT, extractNearTransactionHashes } from '@/lib/near-rpc';
import { ACTIVE_NEAR_NETWORK } from '@/lib/near-network';
import type { SigningWallet } from '@/lib/portal-social-session';

const STORAGE_ADMIN_GAS = '300000000000000';
/** Matches integration tests — share_storage is lighter than pool deposit. */
const STORAGE_SHARE_GAS = '100000000000000';
/** Stay under the ~300 TGas NEAR tx cap when batching multiple share actions. */
const STORAGE_SHARE_BATCH_MAX = 2;

function buildExecuteAdminAction(
  storagePath: string,
  value: Record<string, unknown>
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
    gas: STORAGE_ADMIN_GAS,
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

export async function sendStorageShareTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  targetAccountId: string,
  maxBytes: number
): Promise<string[]> {
  const action = buildExecuteAdminAction('storage/share_storage', {
    target_id: targetAccountId,
    max_bytes: maxBytes,
  });
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
