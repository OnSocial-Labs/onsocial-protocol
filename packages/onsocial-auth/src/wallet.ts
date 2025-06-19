import { HereWallet } from '@here-wallet/core';

let here: any = null;

export async function getHereWallet(options?: any) {
  if (!here) {
    // Per @here-wallet/core docs, use HereWallet.connect()
    here = await HereWallet.connect(options);
  }
  return here;
}

export async function connectWallet(options?: any) {
  return getHereWallet(options);
}

export async function signIn({ contractId }: { contractId: string }) {
  const here = await getHereWallet();
  return await here.signIn({ contractId });
}

export async function signAndSendTransaction(tx: any) {
  const here = await getHereWallet();
  return await here.signAndSendTransaction(tx);
}

export async function signMessage({
  message,
  recipient,
  nonce,
}: {
  message: string;
  recipient: string;
  nonce: Uint8Array;
}) {
  const here = await getHereWallet();
  return await here.signMessage({ message, recipient, nonce });
}

export function _resetHereWallet() {
  here = null;
}
