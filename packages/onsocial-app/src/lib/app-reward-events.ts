import type { PlatformRewardCreditEvent } from '@onsocial/sdk';

type AppRewardCreditListener = (event: PlatformRewardCreditEvent) => void;

const creditListeners = new Set<AppRewardCreditListener>();

export function onAppRewardCredited(listener: AppRewardCreditListener): () => void {
  creditListeners.add(listener);
  return () => {
    creditListeners.delete(listener);
  };
}

export function emitAppRewardCredited(event: PlatformRewardCreditEvent): void {
  if (!event.amountYocto || event.amountYocto === '0') {
    return;
  }
  for (const listener of creditListeners) {
    listener(event);
  }
}
