import { HereWallet, HereInitializeOptions, Action } from '@here-wallet/core';
import { Buffer } from 'buffer';

let here: HereWallet | null = null;

type LocalSignAndSendTransactionOptions = {
  actions: Action[];
  [key: string]: unknown;
};

export async function getHereWallet(options?: HereInitializeOptions) {
  if (!here) {
    // Per @here-wallet/core docs, use HereWallet.connect()
    here = await HereWallet.connect(options);
  }
  return here;
}

export async function connectWallet(options?: HereInitializeOptions) {
  return getHereWallet(options);
}

export async function signIn({ contractId }: { contractId: string }) {
  const here = await getHereWallet();
  return await here.signIn({ contractId });
}

export async function signAndSendTransaction(
  tx: LocalSignAndSendTransactionOptions
): Promise<unknown> {
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
  return await here.signMessage({
    message,
    recipient,
    nonce: Buffer.from(nonce),
  });
}

export function _resetHereWallet() {
  here = null;
}
