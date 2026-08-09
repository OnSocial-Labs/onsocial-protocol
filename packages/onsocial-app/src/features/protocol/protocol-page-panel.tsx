'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PROTOCOL_DAO_BOARD_OPTIONS,
  rememberCommunityDao,
  resolveProtocolDaoAccountId,
} from '@/features/protocol/dao-accounts';
import { actOnProtocolProposal } from '@/features/protocol/protocol-act';
import {
  actionLabel,
  applyOptimisticVote,
  resolveLiveProposal,
} from '@/features/protocol/protocol-card-view';
import { submitProtocolSignalProposal } from '@/features/protocol/protocol-create';
import { ProtocolActionSheet } from '@/features/protocol/protocol-action-sheet';
import { ProtocolCommunityRegistry } from '@/features/protocol/protocol-community-registry';
import { ProtocolCreateSheet } from '@/features/protocol/protocol-create-sheet';
import {
  fetchProtocolFeed,
  fetchProtocolProposal,
} from '@/features/protocol/protocol-feed-client';
import { ProtocolProposalCard } from '@/features/protocol/protocol-proposal-card';
import { ProtocolStakeSheet } from '@/features/protocol/protocol-stake-sheet';
import {
  buildProtocolDelegationPlan,
  prepareProtocolDelegation,
  undelegateProtocolStake,
  withdrawProtocolStake,
} from '@/features/protocol/protocol-staking';
import { getProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import type {
  ProtocolApplication,
  ProtocolDaoAction,
  ProtocolDaoPolicy,
  ProtocolDaoVote,
} from '@/features/protocol/types';
import {
  PROTOCOL_DAO_ACCOUNT_PARAM,
  PROTOCOL_DAO_BOARD_PARAM,
  parseProtocolDaoBoard,
  protocolPath,
  type ProtocolDaoBoard,
} from '@/lib/app-routes';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function ProtocolPagePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const board = parseProtocolDaoBoard(
    searchParams.get(PROTOCOL_DAO_BOARD_PARAM)
  );
  const communityAccount = searchParams.get(PROTOCOL_DAO_ACCOUNT_PARAM);
  const daoAccountId = resolveProtocolDaoAccountId(board, communityAccount);
  const showRegistry = board === 'community' && !daoAccountId;
  const { accountId, isConnected, connect, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const titleId = useId();

  const [applications, setApplications] = useState<ProtocolApplication[]>([]);
  const [daoPolicy, setDaoPolicy] = useState<ProtocolDaoPolicy | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionAppId, setActionAppId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ProtocolDaoAction | null>(
    null
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [stakePending, setStakePending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const actionApplication = useMemo(
    () => applications.find((row) => row.app_id === actionAppId) ?? null,
    [applications, actionAppId]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (board === 'community' && daoAccountId) {
      rememberCommunityDao(daoAccountId);
    }
  }, [board, daoAccountId]);

  const loadFeed = useCallback(async () => {
    if (!daoAccountId) {
      setApplications([]);
      setDaoPolicy(null);
      setLoadState('ready');
      setLoadError(null);
      return;
    }
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

  const navigateBoard = useCallback(
    (next: { board: ProtocolDaoBoard; account?: string | null }) => {
      setActionAppId(null);
      setCreateOpen(false);
      setStakeOpen(false);
      router.replace(
        protocolPath({ board: next.board, account: next.account }),
        { scroll: false }
      );
    },
    [router]
  );

  const mergeProposal = useCallback(
    (
      appId: string,
      nextProposal: NonNullable<ReturnType<typeof resolveLiveProposal>>
    ) => {
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
      if (!actionApplication || !daoAccountId) return;
      const proposal = resolveLiveProposal(actionApplication);
      const proposalId =
        proposal?.id ?? actionApplication.governance_proposal?.proposal_id;
      if (!proposal || proposalId == null) {
        setTxResult({
          type: 'error',
          msg: 'Proposal is missing on-chain data.',
        });
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
            actionApplication.app_id,
            applyOptimisticVote(proposal, signerId, vote)
          );
        }

        await trackTransaction({
          txHashes,
          submittedMessage: txToastGovPending.actionSubmitted(label),
          successMessage: txToastGovSuccess.actionConfirmed(label),
          failureMessage: txToastGovError.actionFailed(label),
        });

        setActionAppId(null);

        try {
          const refreshed = await fetchProtocolProposal({
            daoAccountId,
            proposalId,
            live: true,
          });
          if (refreshed.proposal) {
            mergeProposal(actionApplication.app_id, refreshed.proposal);
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
      actionApplication,
      daoAccountId,
      isConnected,
      connect,
      getSigningWallet,
      mergeProposal,
      trackTransaction,
      setTxResult,
    ]
  );

  const handleCreate = useCallback(
    async (description: string) => {
      if (!daoAccountId) return;
      if (!isConnected) {
        await connect();
        return;
      }
      setCreatePending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const { txHashes } = await submitProtocolSignalProposal({
          wallet,
          accountId: signerId,
          daoAccountId,
          description,
        });
        await trackTransaction({
          txHashes,
          submittedMessage: txToastGovPending.actionSubmitted('signal proposal'),
          successMessage: txToastGovSuccess.actionConfirmed('signal proposal'),
          failureMessage: txToastGovError.actionFailed('signal proposal'),
        });
        setCreateOpen(false);
        await loadFeed();
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          setTxResult({
            type: 'error',
            msg:
              error instanceof Error
                ? error.message
                : txToastGovError.actionFailed('signal proposal'),
          });
        }
      } finally {
        setCreatePending(false);
      }
    },
    [
      daoAccountId,
      isConnected,
      connect,
      getSigningWallet,
      trackTransaction,
      setTxResult,
      loadFeed,
    ]
  );

  const handleDelegate = useCallback(
    async (amountYocto: string) => {
      if (!daoAccountId) return;
      if (!isConnected) {
        await connect();
        return;
      }
      setStakePending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const eligibility = await getProtocolGovernanceEligibility(
          signerId,
          daoAccountId
        );
        if (!eligibility.stakingContractId) {
          throw new Error('This DAO has no staking contract.');
        }
        const plan = buildProtocolDelegationPlan(
          eligibility,
          BigInt(amountYocto)
        );
        if (
          BigInt(plan.depositAmount) > BigInt(eligibility.walletBalance)
        ) {
          throw new Error('Not enough SOCIAL in wallet to deposit.');
        }
        if (
          BigInt(plan.storageDeposit) > 0n &&
          BigInt(plan.storageDeposit) > BigInt(eligibility.nearBalance)
        ) {
          throw new Error('Not enough NEAR for staking storage.');
        }
        const txHashes = await prepareProtocolDelegation({
          wallet,
          accountId: signerId,
          stakingContractId: eligibility.stakingContractId,
          storageDeposit: plan.storageDeposit,
          depositAmount: plan.depositAmount,
          delegateAmount: plan.delegateAmount,
        });
        await trackTransaction({
          txHashes,
          submittedMessage: txToastGovPending.actionSubmitted('delegation'),
          successMessage: txToastGovSuccess.actionConfirmed('delegation'),
          failureMessage: txToastGovError.actionFailed('delegation'),
        });
        setStakeOpen(false);
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          setTxResult({
            type: 'error',
            msg:
              error instanceof Error
                ? error.message
                : txToastGovError.actionFailed('delegation'),
          });
        }
      } finally {
        setStakePending(false);
      }
    },
    [
      daoAccountId,
      isConnected,
      connect,
      getSigningWallet,
      trackTransaction,
      setTxResult,
    ]
  );

  const handleUndelegate = useCallback(
    async (amounts: string[]) => {
      if (!daoAccountId) return;
      if (!isConnected) {
        await connect();
        return;
      }
      setStakePending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const eligibility = await getProtocolGovernanceEligibility(
          signerId,
          daoAccountId
        );
        if (!eligibility.stakingContractId) {
          throw new Error('This DAO has no staking contract.');
        }
        const txHashes = await undelegateProtocolStake({
          wallet,
          accountId: signerId,
          stakingContractId: eligibility.stakingContractId,
          amounts,
        });
        await trackTransaction({
          txHashes,
          submittedMessage: txToastGovPending.actionSubmitted('undelegation'),
          successMessage: txToastGovSuccess.actionConfirmed('undelegation'),
          failureMessage: txToastGovError.actionFailed('undelegation'),
        });
        setStakeOpen(false);
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          setTxResult({
            type: 'error',
            msg:
              error instanceof Error
                ? error.message
                : txToastGovError.actionFailed('undelegation'),
          });
        }
      } finally {
        setStakePending(false);
      }
    },
    [
      daoAccountId,
      isConnected,
      connect,
      getSigningWallet,
      trackTransaction,
      setTxResult,
    ]
  );

  const handleWithdraw = useCallback(
    async (amountYocto: string) => {
      if (!daoAccountId) return;
      if (!isConnected) {
        await connect();
        return;
      }
      setStakePending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const eligibility = await getProtocolGovernanceEligibility(
          signerId,
          daoAccountId
        );
        if (!eligibility.stakingContractId) {
          throw new Error('This DAO has no staking contract.');
        }
        const txHashes = await withdrawProtocolStake({
          wallet,
          accountId: signerId,
          stakingContractId: eligibility.stakingContractId,
          amount: amountYocto,
        });
        await trackTransaction({
          txHashes,
          submittedMessage: txToastGovPending.actionSubmitted('stake withdrawal'),
          successMessage: txToastGovSuccess.actionConfirmed('stake withdrawal'),
          failureMessage: txToastGovError.actionFailed('stake withdrawal'),
        });
        setStakeOpen(false);
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          setTxResult({
            type: 'error',
            msg:
              error instanceof Error
                ? error.message
                : txToastGovError.actionFailed('stake withdrawal'),
          });
        }
      } finally {
        setStakePending(false);
      }
    },
    [
      daoAccountId,
      isConnected,
      connect,
      getSigningWallet,
      trackTransaction,
      setTxResult,
    ]
  );

  const lede =
    board === 'community'
      ? daoAccountId
        ? `Community DAO · @${daoAccountId}`
        : 'Open any Sputnik DAO by account.'
      : 'Governance and treasury decisions for OnSocial.';

  return (
    <OsAppScreen title="Protocol" glassChrome>
      <div className="protocol-page" aria-labelledby={titleId}>
        <header className="protocol-page-head">
          <h1 id={titleId} className="sr-only">
            Protocol
          </h1>
          <p className="protocol-page-lede">{lede}</p>
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
                  onClick={() => navigateBoard({ board: option.value })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {!showRegistry && daoAccountId ? (
            <div className="protocol-tools">
              <button
                type="button"
                className="protocol-tool"
                onClick={() => {
                  setStakeOpen(false);
                  setCreateOpen(true);
                }}
              >
                Propose
              </button>
              <button
                type="button"
                className="protocol-tool"
                onClick={() => {
                  setCreateOpen(false);
                  setStakeOpen(true);
                }}
              >
                Stake
              </button>
              {board === 'community' ? (
                <button
                  type="button"
                  className="protocol-tool is-ghost"
                  onClick={() => navigateBoard({ board: 'community' })}
                >
                  Registry
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        {showRegistry ? (
          <ProtocolCommunityRegistry onOpenDao={navigateBoard} />
        ) : null}

        {!showRegistry && loadState === 'loading' ? (
          <p className="protocol-empty">Loading proposals…</p>
        ) : null}
        {!showRegistry && loadState === 'error' ? (
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
        {!showRegistry && loadState === 'ready' && applications.length === 0 ? (
          <p className="protocol-empty">No open protocol proposals.</p>
        ) : null}
        {!showRegistry && loadState === 'ready' && applications.length > 0 ? (
          <div className="protocol-card-list">
            {applications.map((application) => (
              <ProtocolProposalCard
                key={application.app_id}
                application={application}
                daoPolicy={daoPolicy}
                accountId={accountId}
                nowMs={nowMs}
                onOpenActions={() => setActionAppId(application.app_id)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <ProtocolActionSheet
        open={actionAppId != null}
        onClose={() => setActionAppId(null)}
        application={actionApplication}
        daoPolicy={daoPolicy}
        accountId={accountId}
        pendingAction={pendingAction}
        nowMs={nowMs}
        onAct={(action) => {
          void handleAct(action);
        }}
      />

      <ProtocolCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        daoAccountId={daoAccountId}
        accountId={accountId}
        pending={createPending}
        onSubmit={(description) => {
          void handleCreate(description);
        }}
        onOpenStake={() => {
          setCreateOpen(false);
          setStakeOpen(true);
        }}
      />

      <ProtocolStakeSheet
        open={stakeOpen}
        onClose={() => setStakeOpen(false)}
        daoAccountId={daoAccountId}
        accountId={accountId}
        pending={stakePending}
        onDelegate={(amountYocto) => {
          void handleDelegate(amountYocto);
        }}
        onUndelegate={(amounts) => {
          void handleUndelegate(amounts);
        }}
        onWithdraw={(amountYocto) => {
          void handleWithdraw(amountYocto);
        }}
      />
    </OsAppScreen>
  );
}
