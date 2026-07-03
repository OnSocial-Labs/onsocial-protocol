import { CORE_CONTRACT } from '@/lib/app-near-contract';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import type { NearWalletBase } from '@hot-labs/near-connect';

const STORAGE_ADMIN_GAS = '300000000000000';

interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
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
                  'storage/withdraw': withdrawData,
                },
              },
            },
          },
          gas: STORAGE_ADMIN_GAS,
          deposit: '0',
        },
      },
    ],
  });

  return extractNearTransactionHashes(result);
}
