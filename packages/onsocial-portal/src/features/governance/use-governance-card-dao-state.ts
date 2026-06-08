'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchDaoPolicy, fetchDaoProposal } from '@/features/governance/api';
import {
  ensureGovernanceProposalEventSource,
  subscribeGovernanceProposalUpdates,
} from '@/features/governance/governance-proposal-events-client';
import {
  isTerminalGovernanceProposalStatus,
  mergeGovernanceProposalSnapshot,
  normalizeDaoProposalStatus,
} from '@/features/governance/governance-card-helpers';
import type {
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
  GovernanceProposal,
} from '@/features/governance/types';

const POST_ACTION_REFRESH_MS = 2_000;
const IN_PROGRESS_POLL_MS = 6_000;

export function getFeedProposalSnapshot(
  proposal: GovernanceProposal | null | undefined
): GovernanceDaoProposal | null {
  const snapshot = proposal?.snapshot;
  if (!snapshot) {
    return null;
  }

  const status =
    normalizeDaoProposalStatus(snapshot.status) ??
    (snapshot.status as GovernanceDaoProposal['status']);

  return {
    ...snapshot,
    status,
  };
}

export function hasFeedDaoBootstrap(
  proposal: GovernanceProposal | null | undefined,
  feedDaoPolicy: GovernanceDaoPolicy | null | undefined
): boolean {
  return !!getFeedProposalSnapshot(proposal) && !!feedDaoPolicy;
}

function isInProgressGovernanceProposalStatus(
  status: GovernanceDaoProposal['status'] | string | null | undefined
): boolean {
  const normalized = normalizeDaoProposalStatus(status);
  return normalized === 'InProgress';
}

async function loadDaoProposalFromDb(
  proposalId: number,
  daoAccountId: string
): Promise<GovernanceDaoProposal | null> {
  return fetchDaoProposal(proposalId, daoAccountId);
}

export function useGovernanceCardDaoState({
  proposal,
  feedDaoPolicy = null,
  postActionRefreshUntil = null,
  onPostActionRefreshComplete,
}: {
  proposal: GovernanceProposal | null | undefined;
  feedDaoPolicy?: GovernanceDaoPolicy | null;
  postActionRefreshUntil?: number | null;
  onPostActionRefreshComplete?: () => void;
}) {
  const daoAccountId = proposal?.dao_account ?? null;
  const liveProposalId = proposal?.proposal_id ?? null;
  const feedSnapshot = useMemo(
    () => getFeedProposalSnapshot(proposal),
    [proposal?.snapshot]
  );
  const hasDaoSource = !!daoAccountId && liveProposalId !== null;
  const hasBootstrap = !!feedSnapshot && !!feedDaoPolicy;

  const [daoPolicy, setDaoPolicy] = useState<GovernanceDaoPolicy | null>(
    hasBootstrap ? feedDaoPolicy : null
  );
  const [liveProposal, setLiveProposal] =
    useState<GovernanceDaoProposal | null>(feedSnapshot);
  const [daoLoading, setDaoLoading] = useState(hasDaoSource && !hasBootstrap);
  const [daoSettled, setDaoSettled] = useState(!hasDaoSource || hasBootstrap);

  useEffect(() => {
    if (feedDaoPolicy) {
      setDaoPolicy(feedDaoPolicy);
    }
  }, [feedDaoPolicy]);

  useEffect(() => {
    let cancelled = false;

    async function loadDaoState() {
      if (!daoAccountId || liveProposalId === null) {
        if (!cancelled) {
          setDaoPolicy(null);
          setLiveProposal(null);
          setDaoLoading(false);
          setDaoSettled(true);
        }
        return;
      }

      if (hasBootstrap) {
        if (!cancelled) {
          setDaoPolicy(feedDaoPolicy);
          if (feedSnapshot) {
            setLiveProposal((current) =>
              mergeGovernanceProposalSnapshot(current, feedSnapshot)
            );
          }
          setDaoLoading(false);
          setDaoSettled(true);
        }

        try {
          const refreshedProposal = await loadDaoProposalFromDb(
            liveProposalId,
            daoAccountId
          );
          if (!cancelled) {
            setLiveProposal((current) =>
              mergeGovernanceProposalSnapshot(current, refreshedProposal)
            );
          }
        } catch {
          // Keep feed snapshot when DB refresh fails.
        }

        return;
      }

      if (!cancelled) {
        setDaoLoading(true);
        setDaoSettled(false);
      }

      try {
        const [policy, nextProposal] = await Promise.all([
          feedDaoPolicy
            ? Promise.resolve(feedDaoPolicy)
            : fetchDaoPolicy(daoAccountId),
          loadDaoProposalFromDb(liveProposalId, daoAccountId),
        ]);

        if (!cancelled) {
          setDaoPolicy(policy);
          setLiveProposal((current) =>
            mergeGovernanceProposalSnapshot(current, nextProposal)
          );
        }
      } finally {
        if (!cancelled) {
          setDaoLoading(false);
          setDaoSettled(true);
        }
      }
    }

    void loadDaoState();

    return () => {
      cancelled = true;
    };
  }, [daoAccountId, feedSnapshot, feedDaoPolicy, hasBootstrap, liveProposalId]);

  useEffect(() => {
    if (!daoAccountId || liveProposalId === null) {
      return;
    }

    ensureGovernanceProposalEventSource(daoAccountId);

    return subscribeGovernanceProposalUpdates((updatedProposalId) => {
      if (updatedProposalId !== liveProposalId) {
        return;
      }

      void loadDaoProposalFromDb(liveProposalId, daoAccountId).then(
        (nextProposal) => {
          setLiveProposal((current) =>
            mergeGovernanceProposalSnapshot(current, nextProposal)
          );
        }
      );
    });
  }, [daoAccountId, liveProposalId]);

  useEffect(() => {
    if (
      !daoAccountId ||
      liveProposalId === null ||
      postActionRefreshUntil ||
      !hasBootstrap
    ) {
      return;
    }

    const initialStatus = normalizeDaoProposalStatus(feedSnapshot?.status);
    if (!isInProgressGovernanceProposalStatus(initialStatus)) {
      return;
    }

    const resolvedProposalId = liveProposalId;
    const resolvedDaoAccountId = daoAccountId;
    let cancelled = false;
    let timer: number | null = null;

    async function pollInProgressProposal() {
      try {
        const nextProposal = await loadDaoProposalFromDb(
          resolvedProposalId,
          resolvedDaoAccountId
        );
        if (cancelled) {
          return;
        }

        setLiveProposal((current) =>
          mergeGovernanceProposalSnapshot(current, nextProposal)
        );

        if (
          isTerminalGovernanceProposalStatus(nextProposal?.status) &&
          timer !== null
        ) {
          window.clearInterval(timer);
          timer = null;
        }
      } catch {
        // Keep polling while the proposal remains open.
      }
    }

    void pollInProgressProposal();
    timer = window.setInterval(() => {
      void pollInProgressProposal();
    }, IN_PROGRESS_POLL_MS);

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [
    daoAccountId,
    feedSnapshot?.status,
    hasBootstrap,
    liveProposalId,
    postActionRefreshUntil,
  ]);

  useEffect(() => {
    if (!daoAccountId || liveProposalId === null || !postActionRefreshUntil) {
      return;
    }

    const refreshUntil = postActionRefreshUntil;
    const resolvedProposalId = liveProposalId;
    const resolvedDaoAccountId = daoAccountId;
    let cancelled = false;

    async function refreshLiveProposal() {
      try {
        const nextProposal = await fetchDaoProposal(
          resolvedProposalId,
          resolvedDaoAccountId,
          { live: true }
        );
        if (!cancelled) {
          setLiveProposal((current) =>
            mergeGovernanceProposalSnapshot(current, nextProposal)
          );

          if (isTerminalGovernanceProposalStatus(nextProposal?.status)) {
            onPostActionRefreshComplete?.();
          }
        }
      } finally {
        if (!cancelled && Date.now() + POST_ACTION_REFRESH_MS >= refreshUntil) {
          onPostActionRefreshComplete?.();
        }
      }
    }

    const timer = window.setInterval(() => {
      void refreshLiveProposal();
    }, POST_ACTION_REFRESH_MS);

    void refreshLiveProposal();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    daoAccountId,
    liveProposalId,
    postActionRefreshUntil,
    onPostActionRefreshComplete,
  ]);

  return {
    daoAccountId,
    liveProposalId,
    hasDaoSource,
    daoPolicy,
    liveProposal,
    daoLoading,
    daoSettled,
    setDaoPolicy,
    setLiveProposal,
  };
}

export async function refreshGovernanceProposalAfterAction({
  daoAccountId,
  proposalId,
  feedDaoPolicy = null,
}: {
  daoAccountId: string;
  proposalId: number;
  feedDaoPolicy?: GovernanceDaoPolicy | null;
}): Promise<{
  policy: GovernanceDaoPolicy | null;
  proposal: GovernanceDaoProposal | null;
}> {
  const [policy, proposal] = await Promise.all([
    feedDaoPolicy
      ? Promise.resolve(feedDaoPolicy)
      : fetchDaoPolicy(daoAccountId),
    fetchDaoProposal(proposalId, daoAccountId, { live: true }),
  ]);

  return { policy, proposal };
}
