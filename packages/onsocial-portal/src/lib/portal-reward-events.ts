import type {
  PortalRewardActionProgress,
  PortalRewardToastContext,
} from '@/lib/portal-reward-constants';

export interface PortalRewardCreditEvent extends PortalRewardToastContext {
  amountYocto: string;
  /** Rewards-contract credit tx — present once backend confirms on-chain credit. */
  txHash?: string | null;
  /** Authoritative per-action counts after backend credits (same source as daily caps). */
  actions?: PortalRewardActionProgress;
}

type PortalRewardCreditListener = (event: PortalRewardCreditEvent) => void;

const creditListeners = new Set<PortalRewardCreditListener>();

export function onPortalRewardCredited(
  listener: PortalRewardCreditListener
): () => void {
  creditListeners.add(listener);
  return () => {
    creditListeners.delete(listener);
  };
}

export function emitPortalRewardCredited(event: PortalRewardCreditEvent): void {
  if (!event.amountYocto || event.amountYocto === '0') return;
  for (const listener of creditListeners) {
    listener(event);
  }
}
