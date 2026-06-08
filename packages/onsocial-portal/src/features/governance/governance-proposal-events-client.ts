'use client';

import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';

type ProposalUpdateListener = (proposalId: number) => void;

let sharedSource: EventSource | null = null;
let sharedDaoAccountId: string | null = null;
const listeners = new Set<ProposalUpdateListener>();

function dispatchProposalUpdate(proposalId: number): void {
  for (const listener of listeners) {
    listener(proposalId);
  }
}

export function ensureGovernanceProposalEventSource(
  daoAccountId: string = GOVERNANCE_DAO_ACCOUNT
): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (sharedSource && sharedDaoAccountId === daoAccountId) {
    return;
  }

  sharedSource?.close();
  sharedSource = null;
  sharedDaoAccountId = daoAccountId;

  const search = new URLSearchParams({ daoAccountId });
  const source = new EventSource(`/api/governance/events?${search.toString()}`);

  source.addEventListener('proposal-updated', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as {
        proposalId?: number;
      };
      if (
        typeof payload.proposalId === 'number' &&
        Number.isInteger(payload.proposalId) &&
        payload.proposalId >= 0
      ) {
        dispatchProposalUpdate(payload.proposalId);
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  });

  source.onerror = () => {
    // Browser EventSource auto-reconnects.
  };

  sharedSource = source;
}

export function subscribeGovernanceProposalUpdates(
  listener: ProposalUpdateListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function closeGovernanceProposalEventSource(): void {
  sharedSource?.close();
  sharedSource = null;
  sharedDaoAccountId = null;
}
