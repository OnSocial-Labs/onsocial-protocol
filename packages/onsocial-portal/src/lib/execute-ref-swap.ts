import type { NearWalletBase } from '@hot-labs/near-connect';

import { extractNearTransactionHashes } from '@/lib/near-rpc';
import type { RefSwapTransaction } from '@/lib/ref-swap-types';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';

const NEAR_YOCTO = 10n ** 24n;

/** Ref SDK amounts are human NEAR; near-connect expects yocto deposit strings. */
function refDepositYocto(amount: string | undefined): string {
  const trimmed = (amount || '0').trim();
  if (!trimmed || trimmed === '0') return '0';
  const [whole = '0', frac = ''] = trimmed.split('.');
  const padded = frac.padEnd(24, '0').slice(0, 24);
  return (BigInt(whole) * NEAR_YOCTO + BigInt(padded || '0')).toString();
}

function toNearConnectActions(transaction: RefSwapTransaction) {
  return transaction.functionCalls.map((call) => ({
    type: 'FunctionCall' as const,
    params: {
      methodName: call.methodName,
      args: call.args ?? {},
      gas: call.gas ?? '180000000000000',
      deposit: refDepositYocto(call.amount),
    },
  }));
}

export async function executeRefSwapTransactions(
  wallet: NearWalletBase,
  signerId: string,
  transactions: RefSwapTransaction[]
): Promise<string[]> {
  if (transactions.length === 0) {
    throw new Error('No swap transactions to sign.');
  }

  const mapped = transactions.map((transaction) => ({
    receiverId: transaction.receiverId,
    actions: toNearConnectActions(transaction),
  }));

  if (mapped.length === 1) {
    const [transaction] = mapped;
    const result = await wallet.signAndSendTransaction({
      network: ACTIVE_NEAR_NETWORK,
      signerId,
      receiverId: transaction.receiverId,
      actions: transaction.actions,
    });
    return extractNearTransactionHashes(result);
  }

  const result = await wallet.signAndSendTransactions({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    transactions: mapped,
  });
  return extractNearTransactionHashes(result);
}
