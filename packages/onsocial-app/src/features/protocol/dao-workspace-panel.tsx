'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  Divider,
  OsIconAction,
  OsPageSheet,
  OsProposalCardList,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import {
  rememberCommunityDao,
  resolveKnownBoardForDaoAccount,
} from '@/features/protocol/dao-accounts';
import {
  DaoWorkspaceChromeProvider,
  DaoWorkspaceHeaderSearch,
  DaoWorkspaceHeaderToolbar,
} from '@/features/protocol/dao-workspace-chrome';
import { useDaoPageMood } from '@/features/protocol/use-dao-page-mood';
import { actOnProtocolProposal } from '@/features/protocol/protocol-act';
import {
  actionLabel,
  applyOptimisticVote,
  isProtocolApplicationSoftExpired,
  resolveLiveProposal,
} from '@/features/protocol/protocol-card-view';
import {
  readLastProtocolCreateKind,
  rememberProtocolCreateKind,
  submitProtocolProposal,
  type ProtocolCreateKind,
  type ProtocolProposalPayload,
} from '@/features/protocol/protocol-create';
import { ProtocolActionSheet } from '@/features/protocol/protocol-action-sheet';
import { ProtocolCreateSheet } from '@/features/protocol/protocol-create-sheet';
import { ProtocolDaoInfoSheet } from '@/features/protocol/protocol-dao-info-sheet';
import { ProtocolProposeKindSheet } from '@/features/protocol/protocol-propose-kind-sheet';
import {
  countProtocolApplicationsByFamily,
  countProtocolApplicationsByStatus,
  filterProtocolApplications,
  findProtocolApplicationByProposalId,
  getVisibleProtocolBatch,
  PROTOCOL_FEED_FAMILY_OPTIONS,
  PROTOCOL_FEED_PAGE_SIZE,
  PROTOCOL_FEED_STATUS_OPTIONS,
  type ProtocolProposalFamily,
} from '@/features/protocol/protocol-feed-filters';
import { parseProtocolProposalFamily } from '@/features/protocol/protocol-proposal-family';
import {
  fetchProtocolFeed,
  fetchProtocolProposal,
} from '@/features/protocol/protocol-feed-client';
import {
  daoRoleGroupMembers,
  isProtocolDaoGroupMember,
} from '@/features/protocol/protocol-propose-gate';
import { softIndexDaoMemberships } from '@/features/protocol/my-daos-client';
import { rememberOptimisticMyDao } from '@/features/protocol/my-daos-optimistic';
import {
  ensureProtocolProposalEventSource,
  subscribeProtocolProposalUpdates,
} from '@/features/protocol/protocol-proposal-events-client';
import { ProtocolProposalCard } from '@/features/protocol/protocol-proposal-card';
import { ProtocolProposalListSkeleton } from '@/features/protocol/protocol-proposal-list-skeleton';
import {
  readLastProtocolPolicyAction,
  rememberProtocolPolicyAction,
  type ProtocolPolicyActionId,
} from '@/features/protocol/protocol-policy';
import { ProtocolSettingsActionSheet } from '@/features/protocol/protocol-settings-action-sheet';
import { ProtocolSettingsSheet } from '@/features/protocol/protocol-settings-sheet';
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
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  PROTOCOL_FAMILY_PARAM,
  PROTOCOL_PROPOSAL_PARAM,
  PROTOCOL_SEARCH_PARAM,
  PROTOCOL_STATUS_PARAM,
  daoPortfolioPath,
  parseProtocolFeedStatus,
  parseProtocolProposalId,
  parseProtocolSearchQuery,
  type ProtocolFeedStatusFilter,
} from '@/lib/app-routes';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { replaceBrowserUrl } from '@/lib/sync-browser-url-query';
import {
  bumpDaoWorkspacePrefetch,
  readDaoFeedCache,
  writeDaoFeedCache,
} from '@/lib/dao-workspace-prefetch';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/** Below page drawer (48) + launcher (60) so dock actions aren’t buried. */
const PROPOSALS_PAGE_Z = 45;

/** Tool the Manage sheet can ask `DaoWorkspacePanel` to open. */
export type DaoWorkspaceTool = 'propose' | 'stake' | 'settings' | 'info' | null;

/**
 * Embeddable governance + treasury feed for a single DAO — the Protocol
 * experience, minus the board rail, for use inside DAO portfolios.
 */
export function DaoWorkspacePanel({
  daoAccountId,
  hideTools = false,
  toolsHostOnly = false,
  canPropose = false,
  toolRequest = null,
  onToolRequestHandled,
  onToolsHostClose,
  sheet = null,
}: {
  daoAccountId: string;
  /** When true, hide Propose/Stake/Settings/Info tool chips (Manage sheet owns them). */
  hideTools?: boolean;
  /**
   * Mount tool sheets only (no proposals feed / mood page). Used when Manage
   * opens Stake / Settings / Info from the portfolio face.
   */
  toolsHostOnly?: boolean;
  /** Viewer may create proposals — dock Propose on the mood page. */
  canPropose?: boolean;
  /** Parent Manage sheet requests opening a tool. */
  toolRequest?: DaoWorkspaceTool;
  onToolRequestHandled?: () => void;
  /** Fired when a tools-host session ends (all tool sheets closed). */
  onToolsHostClose?: () => void;
  /** Portfolio proposals mood page — search + filter rails live in the header. */
  sheet?: {
    open: boolean;
    onRequestClose: () => void;
    onClosed?: () => void;
    title?: string;
    subtitle?: string;
    closeAriaLabel?: string;
    zIndex?: number;
    className?: string;
    contentClassName?: string;
  } | null;
}) {
  const titleId = useId();
  const pageMood = useDaoPageMood(daoAccountId, Boolean(sheet?.open));
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<ProtocolFeedStatusFilter>(
    () => parseProtocolFeedStatus(searchParams.get(PROTOCOL_STATUS_PARAM))
  );
  const [familyFilter, setFamilyFilter] = useState<ProtocolProposalFamily>(
    () => parseProtocolProposalFamily(searchParams.get(PROTOCOL_FAMILY_PARAM))
  );
  const [searchQuery, setSearchQuery] = useState(() =>
    parseProtocolSearchQuery(searchParams.get(PROTOCOL_SEARCH_PARAM))
  );
  const [focusedProposalId, setFocusedProposalId] = useState<number | null>(
    () => parseProtocolProposalId(searchParams.get(PROTOCOL_PROPOSAL_PARAM))
  );
  const { accountId, isConnected, connect, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const face = useMatchingDaoFaceEligibility(daoAccountId);
  const loadFreshEligibility = useCallback(
    async (signerId: string) => {
      const fromFace = await face?.refresh({ fresh: true });
      if (fromFace) return fromFace;
      return getProtocolGovernanceEligibility(signerId, daoAccountId, {
        fresh: true,
      });
    },
    [daoAccountId, face]
  );

  const cachedFeed = readDaoFeedCache(daoAccountId);
  const [applications, setApplications] = useState<ProtocolApplication[]>(
    () => cachedFeed?.applications ?? []
  );
  const [daoPolicy, setDaoPolicy] = useState<ProtocolDaoPolicy | null>(
    () => cachedFeed?.daoPolicy ?? null
  );
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    () => (cachedFeed ? 'ready' : 'loading')
  );
  const [feedSyncing, setFeedSyncing] = useState(
    () => Boolean(cachedFeed?.syncing)
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionAppId, setActionAppId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ProtocolDaoAction | null>(
    null
  );
  const [proposeKindOpen, setProposeKindOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<ProtocolCreateKind>(
    () => readLastProtocolCreateKind() ?? 'signal'
  );
  const [stakeOpen, setStakeOpen] = useState(false);
  const [settingsActionOpen, setSettingsActionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsAction, setSettingsAction] =
    useState<ProtocolPolicyActionId>(
      () => readLastProtocolPolicyAction() ?? 'update_vote_policy'
    );
  const [infoOpen, setInfoOpen] = useState(false);
  const [toolsHostSession, setToolsHostSession] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [stakePending, setStakePending] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [focusHandled, setFocusHandled] = useState<number | null>(null);
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const [visibleCount, setVisibleCount] = useState(PROTOCOL_FEED_PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const useHeaderChrome = sheet != null && !toolsHostOnly;

  const closeAllSheets = useCallback(() => {
    setProposeKindOpen(false);
    setCreateOpen(false);
    setStakeOpen(false);
    setSettingsActionOpen(false);
    setSettingsOpen(false);
    setInfoOpen(false);
  }, []);

  const manageToolsOpen =
    proposeKindOpen ||
    createOpen ||
    stakeOpen ||
    settingsActionOpen ||
    settingsOpen ||
    infoOpen;

  const openProposeFromDock = useCallback(() => {
    closeAllSheets();
    setProposeKindOpen(true);
  }, [closeAllSheets]);

  useRegisterComposeAction(
    sheet?.open && !toolsHostOnly && canPropose ? openProposeFromDock : null,
    'propose'
  );

  useEffect(() => {
    setSearchDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setStatusFilter(parseProtocolFeedStatus(params.get(PROTOCOL_STATUS_PARAM)));
    setFamilyFilter(parseProtocolProposalFamily(params.get(PROTOCOL_FAMILY_PARAM)));
    setSearchQuery(parseProtocolSearchQuery(params.get(PROTOCOL_SEARCH_PARAM)));
    setFocusedProposalId(
      parseProtocolProposalId(params.get(PROTOCOL_PROPOSAL_PARAM))
    );
  }, [daoAccountId]);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setStatusFilter(parseProtocolFeedStatus(params.get(PROTOCOL_STATUS_PARAM)));
      setFamilyFilter(parseProtocolProposalFamily(params.get(PROTOCOL_FAMILY_PARAM)));
      setSearchQuery(parseProtocolSearchQuery(params.get(PROTOCOL_SEARCH_PARAM)));
      setFocusedProposalId(
        parseProtocolProposalId(params.get(PROTOCOL_PROPOSAL_PARAM))
      );
    };

    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setVisibleCount(PROTOCOL_FEED_PAGE_SIZE);
    });
  }, [daoAccountId, statusFilter, familyFilter, searchQuery]);

  const actionApplication = useMemo(
    () => applications.find((row) => row.app_id === actionAppId) ?? null,
    [applications, actionAppId]
  );

  const softExpired = useCallback(
    (application: ProtocolApplication) =>
      isProtocolApplicationSoftExpired(application, daoPolicy, nowMs),
    [daoPolicy, nowMs]
  );

  const statusCounts = useMemo(
    () =>
      countProtocolApplicationsByStatus(applications, {
        isSoftExpired: softExpired,
        searchQuery,
        family: familyFilter,
      }),
    [applications, softExpired, searchQuery, familyFilter]
  );

  const familyCounts = useMemo(
    () =>
      countProtocolApplicationsByFamily(applications, {
        isSoftExpired: softExpired,
        searchQuery,
        status: statusFilter,
      }),
    [applications, softExpired, searchQuery, statusFilter]
  );

  const filteredApplications = useMemo(
    () =>
      filterProtocolApplications(applications, statusFilter, {
        isSoftExpired: softExpired,
        searchQuery,
        family: familyFilter,
      }),
    [applications, statusFilter, softExpired, searchQuery, familyFilter]
  );

  const {
    visibleItems: paintedApplications,
    hasMore: hasMorePainted,
    shownCount: paintedCount,
  } = useMemo(
    () => getVisibleProtocolBatch(filteredApplications, visibleCount),
    [filteredApplications, visibleCount]
  );

  const loadMorePainted = useCallback(() => {
    setVisibleCount((count) =>
      Math.min(count + PROTOCOL_FEED_PAGE_SIZE, filteredApplications.length)
    );
  }, [filteredApplications.length]);

  useInfiniteScrollSentinel({
    sentinelRef: loadMoreSentinelRef,
    enabled: hasMorePainted && loadState === 'ready',
    onIntersect: loadMorePainted,
  });

  const feedEndSummary =
    !hasMorePainted && filteredApplications.length > PROTOCOL_FEED_PAGE_SIZE
      ? searchQuery.trim()
        ? `All ${filteredApplications.length} ${filteredApplications.length === 1 ? 'result' : 'results'}`
        : `All ${filteredApplications.length} proposals`
      : null;

  const showColdSkeleton =
    loadState === 'loading' ||
    (loadState === 'ready' && feedSyncing && applications.length === 0);

  const buildDaoHref = useCallback(
    (opts?: {
      status?: ProtocolFeedStatusFilter | null;
      family?: ProtocolProposalFamily | null;
      proposal?: number | null;
      q?: string | null;
    }) =>
      daoPortfolioPath(daoAccountId, {
        status: opts?.status === undefined ? statusFilter : opts.status,
        family: opts?.family === undefined ? familyFilter : opts.family,
        proposal:
          opts?.proposal === undefined ? focusedProposalId : opts.proposal,
        q: opts?.q === undefined ? searchQuery : opts.q,
      }),
    [daoAccountId, statusFilter, familyFilter, focusedProposalId, searchQuery]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (resolveKnownBoardForDaoAccount(daoAccountId) == null) {
      rememberCommunityDao(daoAccountId);
    }
  }, [daoAccountId]);

  useEffect(() => {
    softIndexDaoMemberships(daoAccountId);
  }, [daoAccountId]);

  const loadFeed = useCallback(async (opts?: { soft?: boolean }) => {
    let soft = Boolean(opts?.soft);
    const cached = readDaoFeedCache(daoAccountId);
    if (!soft && cached) {
      setApplications(cached.applications);
      setDaoPolicy((prev) => cached.daoPolicy ?? prev);
      setFeedSyncing(Boolean(cached.syncing));
      setLoadState('ready');
      setLoadError(null);
      soft = true;
    } else if (!soft) {
      setLoadState((prev) => (prev === 'ready' ? prev : 'loading'));
    }
    if (!soft) setLoadError(null);
    try {
      const feed = await fetchProtocolFeed(daoAccountId, 'protocol');
      writeDaoFeedCache(daoAccountId, feed);
      setApplications(feed.applications);
      setDaoPolicy((prev) => feed.daoPolicy ?? prev);
      setFeedSyncing(Boolean(feed.syncing));
      setLoadState('ready');

      if (accountId && feed.daoPolicy) {
        const roleNames = (feed.daoPolicy.roles ?? [])
          .filter((role) =>
            daoRoleGroupMembers(role).some(
              (member) =>
                member.trim().toLowerCase() === accountId.trim().toLowerCase()
            )
          )
          .map((role) => role.name?.trim() ?? '')
          .filter(Boolean);
        if (
          roleNames.length > 0 ||
          isProtocolDaoGroupMember(feed.daoPolicy, accountId)
        ) {
          rememberOptimisticMyDao({
            daoAccountId,
            roleNames:
              roleNames.length > 0 ? roleNames : ['member'],
          });
        }
      }
    } catch (error) {
      if (!soft) {
        setLoadState('error');
        setLoadError(
          error instanceof Error ? error.message : 'Could not load proposals.'
        );
      }
    }
  }, [accountId, daoAccountId]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (!feedSyncing || loadState !== 'ready') return;
    const timer = window.setInterval(() => {
      void loadFeed({ soft: true });
    }, 1600);
    return () => {
      window.clearInterval(timer);
    };
  }, [feedSyncing, loadFeed, loadState]);

  useEffect(() => {
    queueMicrotask(() => {
      setFocusHandled(null);
    });
  }, [focusedProposalId, daoAccountId]);

  useEffect(() => {
    if (
      loadState !== 'ready' ||
      focusedProposalId == null ||
      focusHandled === focusedProposalId
    ) {
      return;
    }

    const match = findProtocolApplicationByProposalId(
      applications,
      focusedProposalId
    );
    if (!match) {
      // Proposal may be filtered out of "open" / family — widen once.
      if (statusFilter !== 'all' || familyFilter !== 'all') {
        setStatusFilter('all');
        setFamilyFilter('all');
        replaceBrowserUrl(
          daoPortfolioPath(daoAccountId, {
            status: 'all',
            family: 'all',
            proposal: focusedProposalId,
            q: searchQuery,
          })
        );
        return;
      }
      setFocusHandled(focusedProposalId);
      return;
    }

    const paintedIndex = filteredApplications.findIndex(
      (row) => row.app_id === match.app_id
    );
    if (paintedIndex >= 0) {
      setVisibleCount((count) => Math.max(count, paintedIndex + 1));
    }
    setFocusHandled(focusedProposalId);
  }, [
    loadState,
    focusedProposalId,
    focusHandled,
    applications,
    filteredApplications,
    statusFilter,
    familyFilter,
    searchQuery,
    daoAccountId,
  ]);

  const scrolledFocusRef = useRef<number | null>(null);
  useEffect(() => {
    scrolledFocusRef.current = null;
  }, [focusedProposalId, daoAccountId]);

  useEffect(() => {
    if (
      focusedProposalId == null ||
      focusHandled !== focusedProposalId ||
      loadState !== 'ready' ||
      scrolledFocusRef.current === focusedProposalId
    ) {
      return;
    }
    const painted = paintedApplications.some((row) => {
      const id =
        resolveLiveProposal(row)?.id ??
        row.governance_proposal?.proposal_id ??
        null;
      return id === focusedProposalId;
    });
    if (!painted) return;

    scrolledFocusRef.current = focusedProposalId;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`protocol-proposal-${focusedProposalId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusHandled, focusedProposalId, loadState, paintedApplications]);

  const navigateStatus = useCallback(
    (nextStatus: ProtocolFeedStatusFilter) => {
      setStatusFilter(nextStatus);
      replaceBrowserUrl(
        daoPortfolioPath(daoAccountId, {
          status: nextStatus,
          family: familyFilter,
          proposal: focusedProposalId,
          q: searchQuery,
        })
      );
    },
    [daoAccountId, familyFilter, focusedProposalId, searchQuery]
  );

  const navigateFamily = useCallback(
    (nextFamily: ProtocolProposalFamily) => {
      setFamilyFilter(nextFamily);
      replaceBrowserUrl(
        daoPortfolioPath(daoAccountId, {
          status: statusFilter,
          family: nextFamily,
          proposal: focusedProposalId,
          q: searchQuery,
        })
      );
    },
    [daoAccountId, statusFilter, focusedProposalId, searchQuery]
  );

  const commitSearch = useCallback(
    (nextQuery: string) => {
      const trimmed = nextQuery.trim();
      setSearchQuery(trimmed);
      replaceBrowserUrl(
        daoPortfolioPath(daoAccountId, {
          status: statusFilter,
          family: familyFilter,
          proposal: focusedProposalId,
          q: trimmed || null,
        })
      );
    },
    [daoAccountId, statusFilter, familyFilter, focusedProposalId]
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
          const previousSnapshot = gp?.snapshot;
          const mergedSnapshot = {
            ...nextProposal,
            policy_snapshot:
              nextProposal.policy_snapshot ??
              previousSnapshot?.policy_snapshot ??
              null,
          };
          return {
            ...row,
            governance_proposal: gp
              ? {
                  ...gp,
                  status: mergedSnapshot.status,
                  snapshot: mergedSnapshot,
                  kind: mergedSnapshot.kind,
                  description: mergedSnapshot.description,
                }
              : gp,
          };
        })
      );
    },
    []
  );

  useEffect(() => {
    ensureProtocolProposalEventSource(daoAccountId);
    return subscribeProtocolProposalUpdates((proposalId) => {
      void fetchProtocolProposal({
        daoAccountId,
        proposalId,
        live: true,
      })
        .then((refreshed) => {
          if (!refreshed.proposal) return;
          setApplications((current) => {
            const match = findProtocolApplicationByProposalId(
              current,
              proposalId
            );
            if (!match) return current;
            return current.map((row) => {
              if (row.app_id !== match.app_id) return row;
              const gp = row.governance_proposal;
              const previousSnapshot = gp?.snapshot;
              const mergedSnapshot = {
                ...refreshed.proposal!,
                policy_snapshot:
                  refreshed.proposal!.policy_snapshot ??
                  previousSnapshot?.policy_snapshot ??
                  null,
              };
              return {
                ...row,
                governance_proposal: gp
                  ? {
                      ...gp,
                      status: mergedSnapshot.status,
                      snapshot: mergedSnapshot,
                      kind: mergedSnapshot.kind,
                      description: mergedSnapshot.description,
                    }
                  : gp,
              };
            });
          });
          if (refreshed.daoPolicy) setDaoPolicy(refreshed.daoPolicy);
        })
        .catch(() => {
          // Best-effort live patch.
        });
    });
  }, [daoAccountId]);

  const handleAct = useCallback(
    async (action: ProtocolDaoAction) => {
      if (!actionApplication) return;
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

        bumpDaoWorkspacePrefetch(daoAccountId);
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
    async (payload: ProtocolProposalPayload) => {
      if (!isConnected) {
        await connect();
        return;
      }
      setCreatePending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const { txHashes } = await submitProtocolProposal({
          wallet,
          accountId: signerId,
          daoAccountId,
          payload,
        });
        await trackTransaction({
          txHashes,
          submittedMessage: txToastGovPending.actionSubmitted('proposal'),
          successMessage: txToastGovSuccess.actionConfirmed('proposal'),
          failureMessage: txToastGovError.actionFailed('proposal'),
        });
        setCreateOpen(false);
        bumpDaoWorkspacePrefetch(daoAccountId);
        await loadFeed();
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          setTxResult({
            type: 'error',
            msg:
              error instanceof Error
                ? error.message
                : txToastGovError.actionFailed('proposal'),
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

  const handleSettings = useCallback(
    async (payload: ProtocolProposalPayload) => {
      if (!isConnected) {
        await connect();
        return;
      }
      setSettingsPending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const { txHashes } = await submitProtocolProposal({
          wallet,
          accountId: signerId,
          daoAccountId,
          payload,
        });
        await trackTransaction({
          txHashes,
          submittedMessage: txToastGovPending.actionSubmitted(
            'settings proposal'
          ),
          successMessage: txToastGovSuccess.actionConfirmed(
            'settings proposal'
          ),
          failureMessage: txToastGovError.actionFailed('settings proposal'),
        });
        setSettingsOpen(false);
        setSettingsActionOpen(false);
        bumpDaoWorkspacePrefetch(daoAccountId);
        await loadFeed();
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          setTxResult({
            type: 'error',
            msg:
              error instanceof Error
                ? error.message
                : txToastGovError.actionFailed('settings proposal'),
          });
        }
      } finally {
        setSettingsPending(false);
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
      if (!isConnected) {
        await connect();
        return;
      }
      setStakePending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const eligibility = await loadFreshEligibility(signerId);
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
        void face?.refresh({ fresh: true });
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
      face,
      isConnected,
      connect,
      getSigningWallet,
      loadFreshEligibility,
      trackTransaction,
      setTxResult,
    ]
  );

  const handleUndelegate = useCallback(
    async (amounts: string[]) => {
      if (!isConnected) {
        await connect();
        return;
      }
      setStakePending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const eligibility = await loadFreshEligibility(signerId);
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
        void face?.refresh({ fresh: true });
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
      face,
      isConnected,
      connect,
      getSigningWallet,
      loadFreshEligibility,
      trackTransaction,
      setTxResult,
    ]
  );

  const handleWithdraw = useCallback(
    async (amountYocto: string) => {
      if (!isConnected) {
        await connect();
        return;
      }
      setStakePending(true);
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const eligibility = await loadFreshEligibility(signerId);
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
        void face?.refresh({ fresh: true });
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
      face,
      isConnected,
      connect,
      getSigningWallet,
      loadFreshEligibility,
      trackTransaction,
      setTxResult,
    ]
  );

  useEffect(() => {
    if (!toolRequest) return;
    closeAllSheets();
    if (toolRequest === 'propose') setProposeKindOpen(true);
    else if (toolRequest === 'stake') setStakeOpen(true);
    else if (toolRequest === 'settings') setSettingsActionOpen(true);
    else if (toolRequest === 'info') setInfoOpen(true);
    if (toolsHostOnly) {
      setToolsHostSession(true);
      return;
    }
    onToolRequestHandled?.();
  }, [toolRequest, onToolRequestHandled, closeAllSheets, toolsHostOnly]);

  useEffect(() => {
    if (!toolsHostOnly || !toolsHostSession || manageToolsOpen) return;
    onToolsHostClose?.();
  }, [toolsHostOnly, toolsHostSession, manageToolsOpen, onToolsHostClose]);

  const chromeValue = useMemo(
    () => ({
      scrollRootRef,
      loadState,
      searchDraft,
      setSearchDraft,
      searchQuery,
      commitSearch,
      statusFilter,
      navigateStatus,
      statusCounts,
      familyFilter,
      navigateFamily,
      familyCounts,
    }),
    [
      loadState,
      searchDraft,
      searchQuery,
      commitSearch,
      statusFilter,
      navigateStatus,
      statusCounts,
      familyFilter,
      navigateFamily,
      familyCounts,
    ]
  );

  const toolSheets = (
    <>
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

      <ProtocolProposeKindSheet
        open={proposeKindOpen}
        onClose={() => setProposeKindOpen(false)}
        daoAccountId={daoAccountId}
        accountId={accountId}
        daoPolicy={daoPolicy}
        lastKind={createKind}
        onSelectKind={(kind) => {
          rememberProtocolCreateKind(kind);
          setCreateKind(kind);
          closeAllSheets();
          setCreateOpen(true);
        }}
        onOpenStake={() => {
          closeAllSheets();
          setStakeOpen(true);
        }}
      />

      <ProtocolCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        daoAccountId={daoAccountId}
        accountId={accountId}
        daoPolicy={daoPolicy}
        pending={createPending}
        initialKind={createKind}
        onSubmit={(payload) => {
          void handleCreate(payload);
        }}
        onOpenStake={() => {
          closeAllSheets();
          setStakeOpen(true);
        }}
        onChangeKind={() => {
          closeAllSheets();
          setProposeKindOpen(true);
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

      <ProtocolSettingsActionSheet
        open={settingsActionOpen}
        onClose={() => setSettingsActionOpen(false)}
        daoAccountId={daoAccountId}
        accountId={accountId}
        daoPolicy={daoPolicy}
        lastAction={settingsAction}
        onSelectAction={(actionId) => {
          rememberProtocolPolicyAction(actionId);
          setSettingsAction(actionId);
          closeAllSheets();
          setSettingsOpen(true);
        }}
        onOpenStake={() => {
          closeAllSheets();
          setStakeOpen(true);
        }}
      />

      <ProtocolSettingsSheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsActionOpen(false);
        }}
        daoAccountId={daoAccountId}
        accountId={accountId}
        daoPolicy={daoPolicy}
        pending={settingsPending}
        initialAction={settingsAction}
        onSubmit={(payload) => {
          void handleSettings(payload);
        }}
        onOpenStake={() => {
          closeAllSheets();
          setStakeOpen(true);
        }}
        onChangeAction={() => {
          closeAllSheets();
          setSettingsActionOpen(true);
        }}
      />

      <ProtocolDaoInfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        daoAccountId={daoAccountId}
        accountId={accountId}
        daoPolicy={daoPolicy}
        onOpenStake={() => {
          closeAllSheets();
          setStakeOpen(true);
        }}
        onOpenSettings={() => {
          closeAllSheets();
          setSettingsActionOpen(true);
        }}
      />
    </>
  );

  const workspace = (
    <div className="dao-workspace">
      {!hideTools ? (
        <div className="protocol-tools">
          <button
            type="button"
            className="protocol-tool"
            onClick={() => {
              closeAllSheets();
              setProposeKindOpen(true);
            }}
          >
            Propose
          </button>
          <button
            type="button"
            className="protocol-tool"
            onClick={() => {
              closeAllSheets();
              setStakeOpen(true);
            }}
          >
            Stake
          </button>
          <button
            type="button"
            className="protocol-tool"
            onClick={() => {
              closeAllSheets();
              setSettingsActionOpen(true);
            }}
          >
            Settings
          </button>
          <button
            type="button"
            className="protocol-tool"
            onClick={() => {
              closeAllSheets();
              setInfoOpen(true);
            }}
          >
            Info
          </button>
        </div>
      ) : null}

      {loadState === 'ready' && !useHeaderChrome ? (
        <label className="protocol-search-field">
          <span className="sr-only">Search proposals</span>
          <input
            type="search"
            value={searchDraft}
            placeholder="Search proposals"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitSearch(searchDraft);
              }
            }}
            onBlur={() => {
              if (searchDraft.trim() !== searchQuery) {
                commitSearch(searchDraft);
              }
            }}
          />
        </label>
      ) : null}

      {loadState === 'ready' && !useHeaderChrome ? (
        <div
          className="protocol-status-rail"
          role="tablist"
          aria-label="Proposal status"
        >
          {PROTOCOL_FEED_STATUS_OPTIONS.map((option) => {
            const count = statusCounts[option.id];
            if (option.id !== 'all' && option.id !== 'open' && count === 0) {
              return null;
            }
            const active = statusFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`protocol-board-chip${active ? ' is-active' : ''}`}
                onClick={() => navigateStatus(option.id)}
              >
                {option.label}
                {option.id !== 'all' ? (
                  <span className="protocol-status-count">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {loadState === 'ready' && !useHeaderChrome ? (
        <div
          className="protocol-family-rail"
          role="tablist"
          aria-label="Proposal kind"
        >
          {PROTOCOL_FEED_FAMILY_OPTIONS.map((option) => {
            const count = familyCounts[option.id];
            if (option.id !== 'all' && count === 0) {
              return null;
            }
            const active = familyFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`protocol-board-chip${active ? ' is-active' : ''}`}
                onClick={() => navigateFamily(option.id)}
              >
                {option.label}
                {option.id !== 'all' ? (
                  <span className="protocol-status-count">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {showColdSkeleton ? (
        <>
          <span className="sr-only" role="status">
            Loading proposals
          </span>
          <ProtocolProposalListSkeleton />
        </>
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
      {loadState === 'ready' && !showColdSkeleton && applications.length === 0 ? (
        <p className="protocol-empty">
          {hideTools ? 'No proposals yet.' : 'No protocol proposals yet.'}
        </p>
      ) : null}
      {loadState === 'ready' &&
      applications.length > 0 &&
      filteredApplications.length === 0 ? (
        <p className="protocol-empty">
          {searchQuery
            ? `No matches for “${searchQuery}”.`
            : familyFilter !== 'all'
              ? `No ${statusFilter === 'all' ? '' : statusFilter === 'open' ? 'open ' : `${statusFilter} `}${PROTOCOL_FEED_FAMILY_OPTIONS.find((o) => o.id === familyFilter)?.label.toLowerCase() ?? familyFilter} proposals.`
              : statusFilter === 'all'
                ? 'No proposals.'
                : `No ${statusFilter === 'open' ? 'open' : statusFilter} proposals.`}
        </p>
      ) : null}
      {loadState === 'ready' && paintedApplications.length > 0 ? (
        <>
          <OsProposalCardList className="protocol-card-list">
            {paintedApplications.map((application) => {
              const proposalId =
                resolveLiveProposal(application)?.id ??
                application.governance_proposal?.proposal_id ??
                null;
              const shareHref =
                proposalId != null
                  ? buildDaoHref({ proposal: proposalId })
                  : null;
              return (
                <ProtocolProposalCard
                  key={application.app_id}
                  application={application}
                  daoPolicy={daoPolicy}
                  daoAccountId={daoAccountId}
                  accountId={accountId}
                  nowMs={nowMs}
                  focused={
                    focusedProposalId != null &&
                    proposalId === focusedProposalId
                  }
                  shareHref={shareHref}
                  onOpenActions={() => {
                    setActionAppId(application.app_id);
                    if (proposalId != null) {
                      setFocusedProposalId(proposalId);
                      replaceBrowserUrl(
                        daoPortfolioPath(daoAccountId, {
                          status: statusFilter,
                          family: familyFilter,
                          proposal: proposalId,
                          q: searchQuery,
                        })
                      );
                    }
                  }}
                  onCopyLink={
                    shareHref
                      ? () => {
                          void navigator.clipboard?.writeText(
                            new URL(
                              shareHref,
                              window.location.origin
                            ).toString()
                          );
                        }
                      : undefined
                  }
                />
              );
            })}
          </OsProposalCardList>
          {hasMorePainted || feedEndSummary ? (
            <div className="protocol-feed-load-more">
              {hasMorePainted ? (
                <>
                  <div
                    ref={loadMoreSentinelRef}
                    className="protocol-feed-sentinel"
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="protocol-feed-more"
                    onClick={loadMorePainted}
                  >
                    Load more
                    <span className="protocol-status-count">
                      {paintedCount}/{filteredApplications.length}
                    </span>
                  </button>
                </>
              ) : null}
              {feedEndSummary ? (
                <p className="protocol-feed-end">{feedEndSummary}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {toolSheets}
    </div>
  );

  const setPageBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRootRef.current = node;
    },
    []
  );

  return (
    <DaoWorkspaceChromeProvider value={chromeValue}>
      {toolsHostOnly ? (
        toolSheets
      ) : sheet ? (
        <OsPageSheet
          open={sheet.open}
          onClose={sheet.onRequestClose}
          onClosed={sheet.onClosed}
          surface="page"
          presentation="appear"
          keepDock
          dragDismiss={false}
          zIndex={sheet.zIndex ?? PROPOSALS_PAGE_Z}
          ariaLabelledBy={titleId}
          backdropLabel={sheet.closeAriaLabel ?? 'Back from proposals'}
          moodId={pageMood.moodId ?? undefined}
          moodStyle={pageMood.moodStyle}
          panelClassName={sheet.className ?? 'dao-proposals-page'}
          bodyClassName={
            sheet.contentClassName ?? 'dao-proposals-page-body'
          }
          bodyRef={setPageBodyRef}
          header={
            <>
              <header className="dao-proposals-page-header">
                <div className="os-app-screen-nav-row">
                  <OsIconAction
                    ariaLabel={sheet.closeAriaLabel ?? 'Back from proposals'}
                    onClick={sheet.onRequestClose}
                  >
                    <ArrowLeftIcon
                      className="glass-sheet-close-icon"
                      aria-hidden
                    />
                  </OsIconAction>
                  <div className="os-app-screen-heading">
                    <h1 id={titleId} className="sr-only">
                      {sheet.title ?? 'Proposals'}
                    </h1>
                    {sheet.subtitle ? (
                      <p className="sr-only">{sheet.subtitle}</p>
                    ) : null}
                    <DaoWorkspaceHeaderSearch />
                  </div>
                </div>
                <DaoWorkspaceHeaderToolbar />
              </header>
              <Divider
                variant="section"
                className="glass-sheet-header-divider"
              />
            </>
          }
        >
          {workspace}
        </OsPageSheet>
      ) : (
        workspace
      )}
    </DaoWorkspaceChromeProvider>
  );
}
