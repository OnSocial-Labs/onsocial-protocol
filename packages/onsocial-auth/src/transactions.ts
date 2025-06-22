import { getHereWallet } from './wallet';
import type { Action } from '@here-wallet/core';

type LocalSignAndSendTransactionOptions = {
  actions: Action[];
  [key: string]: unknown;
};

export async function formatTransaction({
  actions,
  receiverId,
}: {
  actions: Action[];
  receiverId: string;
}) {
  // Format tx for HERE Wallet
  return { actions, receiverId };
}

export async function signAndSendTransaction(
  tx: LocalSignAndSendTransactionOptions
): Promise<unknown> {
  const here = await getHereWallet();
  return await here.signAndSendTransaction(tx);
}
