import { getHereWallet } from './wallet';

export async function formatTransaction({
  actions,
  receiverId,
}: {
  actions: any[];
  receiverId: string;
}) {
  // Format tx for HERE Wallet
  return { actions, receiverId };
}

export async function signAndSendTransaction(tx: any) {
  const here = await getHereWallet();
  return await here.signAndSendTransaction(tx);
}
