'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PROTOCOL_DAO_BOARD_OPTIONS,
  resolveProtocolDaoAccountId,
} from '@/features/protocol/dao-accounts';
import { actOnProtocolProposal } from '@/features/protocol/protocol-act';
import {
  actionLabel,
  applyOptimisticVote,
  deriveProtocolProposalActions,
  proposalHeadline,
  proposalKindKey,
  resolveLiveProposal,
  statusLabel,
} from '@/features/protocol/protocol-card-view';
import { fetchProtocolFeed, fetchProtocolProposal } from '@/features/protocol/protocol-feed-client';
import { ProtocolProposalSheet } from '@/features/protocol/protocol-proposal-sheet';
import type {
  ProtocolApplication,
  ProtocolDaoAction,
  ProtocolDaoPolicy,
  ProtocolDaoVote,
} from '@/features/protocol/types';
import {
  PROTOCOL_DAO_BOARD_PARAM,
  parseProtocolDaoBoard,
  protocolPath,
  type ProtocolDaoBoard,
} from '@/lib/app-routes';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function ProtocolProposalRow({
  application,
  daoPolicy,
  accountId,
  onOpen,
}: {
  application: ProtocolApplication;
  daoPolicy: ProtocolDaoPolicy | null;
  accountId: string | null;
  onOpen: () => void;
}) {
  const proposal = resolveLiveProposal(application);
  const headline = proposalHeadline(application);
  const kind = proposalKindKey(proposal);
  const status = statusLabel(proposal?.status);
  const actions = deriveProtocolProposalActions({
    accountId,
    daoPolicy,
    proposal,
  });
  const proposer = proposal?.proposer?.trim() || '';

  return (
    <button
      type="button"
      className="protocol-proposal-row"
      onClick={onOpen}
    >
      <span className="protocol-proposal-row-copy">
        <span className="protocol-proposal-row-head">
          <span className="protocol-proposal-row-title">{headline}</span>
          <span className="protocol-pill is-status">{status}</span>
        </span>
        <span className="protocol-proposal-row-meta">
          <span className="protocol-pill">{kind}</span>
          {proposer ? (
            <span className="protocol-proposal-row-muted">
              @{fallbackLabel(proposer)}
            </span>
          ) : null}
          <span className="protocol-proposal-row-muted">
            {actions.approveVotes}·{actions.rejectVotes}
          </span>
          {actions.currentVote ? (
            <span className="protocol-pill is-vote">
              You · {actions.currentVote}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function ProtocolPagePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const board = parseProtocolDaoBoard(
    searchParams.get(PROTOCOL_DAO_BOARD_PARAM)
  );
  const daoAccountId = resolveProtocolDaoAccountId(board);
  const { accountId, isConnected, connect, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const titleId = useId();

  const [applications, setApplications] = useState<ProtocolApplication[]>([]);
  const [daoPolicy, setDaoPolicy] = useState<ProtocolDaoPolicy | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ProtocolDaoAction | null>(
    null
  );

  const selected = useMemo(
    () => applications.find((row) => row.app_id === selectedId) ?? null,
    [applications, selectedId]
  );

  const loadFeed = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);
    try {
      const feed = await fetchProtocolFeed(daoAccountId, 'protocol');
      setApplications(feed.applications);
      setDaoPolicy(feed.daoPolicy);
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      setLoadError(
        error instanceof Error ? error.message : 'Could not load proposals.'
      );
    }
  }, [daoAccountId]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const setBoard = useCallback(
    (next: ProtocolDaoBoard) => {
      setSelectedId(null);
      router.replace(protocolPath({ board: next }), { scroll: false });
    },
    [router]
  );

  const mergeProposal = useCallback(
    (appId: string, nextProposal: NonNullable<ReturnType<typeof resolveLiveProposal>>) => {
      setApplications((current) =>
        current.map((row) => {
          if (row.app_id !== appId) return row;
          const gp = row.governance_proposal;
          return {
            ...row,
            governance_proposal: gp
              ? {
                  ...gp,
                  status: nextProposal.status,
                  snapshot: nextProposal,
                  kind: nextProposal.kind,
                  description: nextProposal.description,
                }
              : gp,
          };
        })
      );
    },
    []
  );

  const handleAct = useCallback(
    async (action: ProtocolDaoAction) => {
      if (!selected) return;
      const proposal = resolveLiveProposal(selected);
      const proposalId = proposal?.id ?? selected.governance_proposal?.proposal_id;
      if (!proposal || proposalId == null) {
        setTxResult({ type: 'error', msg: 'Proposal is missing on-chain data.' });
        return;
      }
      if (!isConnected) {
        await connect();
        return;
      }

      const label = actionLabel(action);
      setPendingAction(action);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const txHashes = await actOnProtocolProposal({
          wallet,
          accountId: signerId,
          daoAccountId,
          proposalId,
          action,
          proposalKind: proposal.kind,
        });

        if (action !== 'Finalize') {
          const vote: ProtocolDaoVote =
            action === 'VoteApprove'
              ? 'Approve'
              : action === 'VoteReject'
                ? 'Reject'
                : 'Remove';
          mergeProposal(
            selected.app_id,
            applyOptimisticVote(proposal, signerId, vote)
          );
        }

        await trackTransaction({
          txHashes,
          submittedMessage: txToastGovPending.actionSubmitted(label),
          successMessage: txToastGovSuccess.actionConfirmed(label),
          failureMessage: txToastGovError.actionFailed(label),
        });

        try {
          const refreshed = await fetchProtocolProposal({
            daoAccountId,
            proposalId,
            live: true,
          });
          if (refreshed.proposal) {
            mergeProposal(selected.app_id, refreshed.proposal);
          }
          if (refreshed.daoPolicy) setDaoPolicy(refreshed.daoPolicy);
        } catch {
          // soft refresh best-effort
        }
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          setTxResult({
            type: 'error',
            msg:
              error instanceof Error
                ? error.message
                : txToastGovError.actionFailed(label),
          });
        }
      } finally {
        setPendingAction(null);
      }
    },
    [
      selected,
      isConnected,
      connect,
      getSigningWallet,
      daoAccountId,
      mergeProposal,
      trackTransaction,
      setTxResult,
    ]
  );

  return (
    <OsAppScreen title="Protocol" glassChrome>
      <div className="protocol-page" aria-labelledby={titleId}>
        <header className="protocol-page-head">
          <h1 id={titleId} className="sr-only">
            Protocol
          </h1>
          <p className="protocol-page-lede">
            Governance and treasury decisions for OnSocial.
          </p>
          <div
            className="protocol-board-rail"
            role="tablist"
            aria-label="DAO board"
          >
            {PROTOCOL_DAO_BOARD_OPTIONS.map((option) => {
              const active = option.value === board;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`protocol-board-chip${active ? ' is-active' : ''}`}
                  onClick={() => setBoard(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </header>

        {loadState === 'loading' ? (
          <p className="protocol-empty">Loading proposals…</p>
        ) : null}
        {loadState === 'error' ? (
          <div className="protocol-empty">
            <p>{loadError || 'Could not load proposals.'}</p>
            <button
              type="button"
              className="protocol-retry"
              onClick={() => void loadFeed()}
            >
              Retry
            </button>
          </div>
        ) : null}
        {loadState === 'ready' && applications.length === 0 ? (
          <p className="protocol-empty">No open protocol proposals.</p>
        ) : null}
        {loadState === 'ready' && applications.length > 0 ? (
          <div className="protocol-proposal-list" role="list">
            {applications.map((application) => (
              <div key={application.app_id} role="listitem">
                <ProtocolProposalRow
                  application={application}
                  daoPolicy={daoPolicy}
                  accountId={accountId}
                  onOpen={() => setSelectedId(application.app_id)}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <ProtocolProposalSheet
        open={selectedId != null}
        onClose={() => setSelectedId(null)}
        application={selected}
        daoPolicy={daoPolicy}
        accountId={accountId}
        pendingAction={pendingAction}
        onAct={(action) => {
          void handleAct(action);
        }}
      />
    </OsAppScreen>
  );
}
