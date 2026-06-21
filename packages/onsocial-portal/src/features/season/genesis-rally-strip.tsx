'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { portalConnectCtaLabel } from '@/lib/portal-connect-copy';
import { useWallet } from '@/contexts/wallet-context';
import { useSeasonParticipation } from '@/contexts/season-participation-context';

const SocialSwapModal = dynamic(
  () =>
    import('@/components/social-swap-modal').then((module) => ({
      default: module.SocialSwapModal,
    })),
  { ssr: false }
);
import { Button } from '@/components/ui/button';
import { PortalConnectPrompt } from '@/components/ui/portal-connect-prompt';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { useSocialWalletBalance } from '@/hooks/use-social-wallet-balance';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import {
  getActiveSeasonId,
  getSeasonPresentation,
  seasonApiPath,
} from '@/lib/active-season';
import {
  useSeasonRegistry,
  type SeasonPhase,
  resolvePromoSeasonEntry,
  resolvePromoSeasonId,
} from '@/lib/season-registry';
import { fadeMotion } from '@/lib/motion';
import { extractNearTransactionHashes } from '@/lib/near-rpc';
import {
  fetchJoinRallyRouting,
  formatJoinRoutingDisclosure,
  type JoinRallyRoutingDisclosure,
} from '@/lib/join-rally-routing';
import { PORTAL_SWAP_ENABLED } from '@/lib/portal-swap-config';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { SeasonZeroMetricsRail } from '@/features/season/season-zero-metrics-rail';
import {
  StandingRow,
  StandingRowSkeleton,
  type SeasonZeroStanding,
} from '@/features/season/season-zero-standing-row';
import type {
  SeasonZeroClaimRecord,
  SeasonZeroLifecyclePhase,
  SeasonZeroOnChainConfig,
  SeasonZeroSettlementSummary,
  SeasonZeroStatusPayload,
} from '@/features/season/season-zero-types';
import { resolveSeasonZeroLifecyclePhase } from '@/features/season/season-zero-types';
import {
  isPostLiveSeasonPhase,
  resolveSeasonZeroClaimMetricsStatus,
} from '@/features/season/season-zero-claim-copy';
import { SeasonClaimInlineAction } from '@/features/season/season-claim-inline-action';
import { seasonZeroPayoutSummary } from '@/features/season/season-zero-payout-copy';
import type { SeasonZeroPayoutParticipant } from '@/features/season/season-zero-payout-estimate';
import { isSeasonSettlementPublished } from '@/features/season/season-zero-types';
import { cn } from '@/lib/utils';

const os = createPortalOnSocialClient();

function rallyStatusPlaceholder() {
  return (
    <div
      className="h-3.5 w-[13rem] max-w-full animate-pulse rounded-full bg-foreground/[0.06]"
      aria-hidden
    />
  );
}

function RallyActionSlot({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center justify-center',
        wide ? 'min-w-0' : 'w-[7.25rem]'
      )}
    >
      {children}
    </div>
  );
}

function rallyActionPlaceholder() {
  return (
    <div
      className="h-9 w-full animate-pulse rounded-full bg-foreground/[0.06]"
      aria-hidden
    />
  );
}

type RallyFooterMode = 'loading' | 'joined' | 'post-live-connect' | 'join';

function rallyFooterFade(reduceMotion: boolean | null, duration = 0.18) {
  return fadeMotion(reduceMotion ? 0 : duration);
}

function rallyFooterShellClass(hasMetrics: boolean) {
  return cn(hasMetrics && 'border-t border-fade-section');
}

interface SeasonZeroMeResponse {
  success?: boolean;
  standing?: SeasonZeroStanding | null;
}

interface PortalProfileResponse {
  avatarUrl?: string | null;
  profile?: { name?: string | null } | null;
}

export function GenesisRallyStrip({
  className,
  variant = 'page',
  seasonId: seasonIdProp,
  onChainConfig = null,
  indexedPoolYocto,
  joinPoolYocto,
  sponsoredPoolYocto,
  settlement = null,
  participantCount = 0,
  myStanding: myStandingProp = null,
  pageDataReady,
  claimStatusReady = true,
  registryPhase = null,
  phase: phaseProp = null,
  claim = null,
  payoutParticipants = null,
  publishedRewardByAccountId = null,
  personalAccountId = null,
  onParticipationChange,
  onClaimed,
}: {
  className?: string;
  /** `promo` — home Live section. `page` — rally hero (metrics + join). */
  variant?: 'page' | 'promo';
  /** On-chain season id for joins and API reads. */
  seasonId?: string;
  onChainConfig?: SeasonZeroOnChainConfig | null;
  indexedPoolYocto?: string;
  joinPoolYocto?: string;
  sponsoredPoolYocto?: string;
  settlement?: SeasonZeroSettlementSummary | null;
  participantCount?: number;
  /** When provided (e.g. from Season 0 page), avoids a duplicate standing fetch. */
  myStanding?: SeasonZeroStanding | null;
  /** Page variant: parent has finished its first status/standings load. */
  pageDataReady?: boolean;
  /** Wallet claim lookup finished for the current account + season. */
  claimStatusReady?: boolean;
  /** Registry phase hint for gold panel styling before on-chain config resolves. */
  registryPhase?: SeasonPhase | null;
  phase?: SeasonZeroLifecyclePhase | null;
  claim?: SeasonZeroClaimRecord | null;
  /** Live standings for payout estimates (up to 100 rows from the page). */
  payoutParticipants?: SeasonZeroPayoutParticipant[] | null;
  /** Final reward amounts by account id after settlement publish. */
  publishedRewardByAccountId?: Record<string, string> | null;
  personalAccountId?: string | null;
  /** Called after a successful join so the parent can refresh standings. */
  onParticipationChange?: () => void;
  onClaimed?: () => void;
}) {
  const { registry } = useSeasonRegistry({ enabled: variant === 'promo' });
  const promoSeasonId = useMemo(() => {
    if (variant !== 'promo') {
      return null;
    }
    return resolvePromoSeasonId(registry) ?? getActiveSeasonId();
  }, [registry, variant]);
  const seasonId =
    seasonIdProp ??
    (variant === 'promo' ? promoSeasonId : null) ??
    registry?.resolvedActiveSeasonId ??
    registry?.live?.seasonId ??
    getActiveSeasonId();
  const reduceMotion = useReducedMotion();
  const {
    accountId,
    connect,
    getSigningWallet,
    isConnected,
    isLoading: walletLoading,
  } = useWallet();
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const {
    beginSeasonJoin,
    confirmSeasonJoin,
    endSeasonJoin,
    isSeasonJoinPending,
    resolveSeasonJoinedFor,
    reconcileSeasonJoinFromApi,
    participateSyncVersion,
  } = useSeasonParticipation();
  const [loading, setLoading] = useState(true);
  const [apiJoined, setApiJoined] = useState(false);
  const joined = useMemo(
    () => resolveSeasonJoinedFor(seasonId, apiJoined),
    [apiJoined, resolveSeasonJoinedFor, seasonId, participateSyncVersion]
  );
  const joinPending = isSeasonJoinPending(seasonId);
  const [fetchedMyStanding, setFetchedMyStanding] =
    useState<SeasonZeroStanding | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [promoOnChainConfig, setPromoOnChainConfig] =
    useState<SeasonZeroOnChainConfig | null>(null);
  const [promoIndexedPoolYocto, setPromoIndexedPoolYocto] = useState('0');
  const [promoJoinPoolYocto, setPromoJoinPoolYocto] = useState('0');
  const [promoSponsoredPoolYocto, setPromoSponsoredPoolYocto] = useState('0');
  const [promoSettlement, setPromoSettlement] =
    useState<SeasonZeroSettlementSummary | null>(null);
  const [promoParticipantCount, setPromoParticipantCount] = useState(0);
  const [promoStatusReady, setPromoStatusReady] = useState(variant !== 'promo');
  const [joinRoutingDisclosure, setJoinRoutingDisclosure] = useState('');
  const [joinRouting, setJoinRouting] =
    useState<JoinRallyRoutingDisclosure | null>(null);
  const [joinRoutingLoading, setJoinRoutingLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setJoinRoutingLoading(true);
    void fetchJoinRallyRouting()
      .then((routing) => {
        if (cancelled) return;
        setJoinRouting(routing);
        setJoinRoutingDisclosure(
          routing ? formatJoinRoutingDisclosure(routing) : ''
        );
      })
      .catch(() => {
        if (!cancelled) {
          setJoinRouting(null);
          setJoinRoutingDisclosure('');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setJoinRoutingLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const {
    balanceYocto,
    hasLoadedBalance,
    loading: balanceLoading,
    refresh: refreshBalance,
  } = useSocialWalletBalance(accountId, balanceRefreshKey);

  const myStanding = myStandingProp ?? fetchedMyStanding;
  const registryEntry =
    registry?.seasons.find((entry) => entry.seasonId === seasonId) ?? null;
  const seasonPresentation = useMemo(
    () => getSeasonPresentation(seasonId, registryEntry),
    [registryEntry, seasonId]
  );
  const promoEntry =
    variant === 'promo' ? resolvePromoSeasonEntry(registry) : null;
  const promoHref =
    variant === 'promo'
      ? (promoEntry?.rallyPath ?? seasonPresentation.rallyPath)
      : seasonPresentation.rallyPath;

  const refresh = useCallback(async () => {
    if (myStandingProp) {
      setApiJoined(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (!accountId) {
        setApiJoined(false);
        setFetchedMyStanding(null);
        return;
      }

      const [meData, profileData] = await Promise.all([
        fetch(
          `${seasonApiPath(seasonId, 'me')}?account_id=${encodeURIComponent(accountId)}`,
          { cache: 'no-store' }
        )
          .then((response) => response.json() as Promise<SeasonZeroMeResponse>)
          .catch(() => null),
        fetch(`/api/profile?accountId=${encodeURIComponent(accountId)}`, {
          cache: 'no-store',
        })
          .then((response) => response.json() as Promise<PortalProfileResponse>)
          .catch(() => null),
      ]);

      const standing = meData?.standing ?? null;
      const isJoined = Boolean(standing);
      setApiJoined(isJoined);
      reconcileSeasonJoinFromApi(seasonId, isJoined);
      setFetchedMyStanding(
        isJoined && standing
          ? {
              ...standing,
              accountId: standing.accountId ?? accountId,
              displayName: profileData?.profile?.name ?? null,
              avatarUrl: profileData?.avatarUrl ?? null,
            }
          : null
      );
    } catch {
      setApiJoined(false);
      setFetchedMyStanding(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, myStandingProp, reconcileSeasonJoinFromApi, seasonId]);

  useEffect(() => {
    if (myStandingProp) {
      setApiJoined(true);
      setLoading(false);
      return;
    }

    if (variant === 'page' && pageDataReady === false) {
      setLoading(true);
      return;
    }

    setApiJoined(false);
    setFetchedMyStanding(null);
    setLoading(true);
    void refresh();
  }, [accountId, myStandingProp, pageDataReady, refresh, variant]);

  useEffect(() => {
    if (variant !== 'promo') return;

    let cancelled = false;
    setPromoStatusReady(false);

    Promise.resolve()
      .then(async () => {
        const statusRes = await fetch(seasonApiPath(seasonId, 'status'), {
          cache: 'no-store',
        });
        if (cancelled) return;

        const statusData = (await statusRes.json()) as SeasonZeroStatusPayload;
        const onChain =
          statusRes.ok && statusData.success !== false
            ? (statusData.onChainConfig ?? null)
            : null;

        if (onChain) {
          setPromoOnChainConfig(onChain);
          setPromoIndexedPoolYocto(statusData.indexedPoolYocto ?? '0');
          setPromoJoinPoolYocto(statusData.joinPoolYocto ?? '0');
          setPromoSponsoredPoolYocto(statusData.sponsoredPoolYocto ?? '0');
          setPromoSettlement(statusData.settlement ?? null);
        }

        const standingsCutoff =
          onChain && !onChain.is_live && onChain.ends_at_ns
            ? `&cutoff_timestamp_ns=${encodeURIComponent(onChain.ends_at_ns)}`
            : '';

        const standingsRes = await fetch(
          `${seasonApiPath(seasonId, 'standings')}?limit=1${standingsCutoff}`,
          { cache: 'no-store' }
        );
        if (cancelled) return;

        const standingsData = (await standingsRes.json()) as {
          total?: number;
        };
        if (standingsRes.ok) {
          setPromoParticipantCount(standingsData.total ?? 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromoOnChainConfig(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPromoStatusReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [variant, seasonId]);

  const effectiveRegistryPhase = registryPhase ?? registryEntry?.phase ?? null;
  const awaitingParticipationData =
    (variant === 'page' && (pageDataReady === false || walletLoading)) ||
    (variant === 'promo' && (!promoStatusReady || walletLoading));
  const claimStatusResolved =
    claimStatusReady && !walletLoading && pageDataReady !== false;
  const statusLoading = loading || awaitingParticipationData;
  const joinConfigReady = joinRouting != null;
  const joinMinAmountYocto = joinRouting?.joinMinAmountYocto ?? null;
  const joinMinAmountLabel = joinRouting?.joinMinAmountSocialLabel ?? null;
  const hasEnoughSocial =
    joinMinAmountYocto != null && balanceYocto >= joinMinAmountYocto;
  const showInsufficientBalance =
    isConnected &&
    hasLoadedBalance &&
    joinConfigReady &&
    !hasEnoughSocial &&
    !joined &&
    !statusLoading;

  const socialShortfallYocto = useMemo(() => {
    if (
      !isConnected ||
      !hasLoadedBalance ||
      !joinConfigReady ||
      joinMinAmountYocto == null ||
      hasEnoughSocial
    ) {
      return 0n;
    }
    return joinMinAmountYocto > balanceYocto
      ? joinMinAmountYocto - balanceYocto
      : 0n;
  }, [
    balanceYocto,
    hasEnoughSocial,
    hasLoadedBalance,
    isConnected,
    joinConfigReady,
    joinMinAmountYocto,
  ]);

  const handleJoin = useCallback(async () => {
    if (joined || joinPending || !joinRouting || joinMinAmountYocto == null) {
      return;
    }
    if (!isConnected) {
      await connect();
      return;
    }
    if (!hasEnoughSocial) {
      setSwapOpen(true);
      return;
    }

    beginSeasonJoin(seasonId);
    try {
      const { wallet, accountId: signerId } = await getSigningWallet();
      const payload = os.socialSpend.buildSpendTransaction({
        amount: joinMinAmountYocto.toString(),
        appId: 'portal',
        action: 'join_rally',
        targetType: 'rally',
        targetId: seasonId,
        seasonId,
      });

      const result = await wallet.signAndSendTransaction({
        network: ACTIVE_NEAR_NETWORK,
        signerId,
        receiverId: payload.receiverId,
        actions: payload.actions.map((action) => ({
          type: 'FunctionCall' as const,
          params: {
            methodName: action.methodName,
            args: action.args,
            gas: action.gas,
            deposit: action.deposit,
          },
        })),
      });

      const txHashes = extractNearTransactionHashes(result);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastPending.joiningRally(
          seasonPresentation.pageTitle
        ),
        successMessage: txToastSuccess.joinedRally(
          seasonPresentation.pageTitle
        ),
        failureMessage: txToastError.joinRallyFailed,
      });

      if (confirmed) {
        confirmSeasonJoin(seasonId);
        setBalanceRefreshKey((value) => value + 1);
        window.setTimeout(() => {
          void refresh();
          onParticipationChange?.();
        }, 4_000);
      }
    } catch (error) {
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error ? error.message : 'Could not join the rally.',
      });
    } finally {
      endSeasonJoin(seasonId);
    }
  }, [
    beginSeasonJoin,
    confirmSeasonJoin,
    connect,
    endSeasonJoin,
    getSigningWallet,
    hasEnoughSocial,
    isConnected,
    joinPending,
    joined,
    refresh,
    seasonId,
    setTxResult,
    trackTransaction,
    joinMinAmountYocto,
    joinRouting,
    onParticipationChange,
    seasonPresentation.pageTitle,
  ]);

  const handleSwapSuccess = useCallback(() => {
    setBalanceRefreshKey((value) => value + 1);
    void refreshBalance();
  }, [refreshBalance]);

  const statusLabel = useMemo(() => {
    if (joined) return 'In the rally';
    if (walletLoading) return 'Checking wallet…';
    if (!isConnected) return portalConnectCtaLabel('season.join');
    if (!hasLoadedBalance || balanceLoading) return 'Checking balance…';
    if (!hasEnoughSocial) {
      return socialShortfallYocto > 0n
        ? `Need ${formatGenesisSocialBalanceDisplay(socialShortfallYocto)} more`
        : 'Need SOCIAL';
    }
    return 'Ready to join';
  }, [
    balanceLoading,
    hasEnoughSocial,
    hasLoadedBalance,
    isConnected,
    joined,
    socialShortfallYocto,
    walletLoading,
  ]);

  const metricsOnChainConfig =
    variant === 'promo' ? promoOnChainConfig : onChainConfig;
  const metricsIndexedPoolYocto =
    variant === 'promo' ? promoIndexedPoolYocto : indexedPoolYocto;
  const metricsJoinPoolYocto =
    variant === 'promo' ? promoJoinPoolYocto : joinPoolYocto;
  const metricsSponsoredPoolYocto =
    variant === 'promo' ? promoSponsoredPoolYocto : sponsoredPoolYocto;
  const metricsSettlement = variant === 'promo' ? promoSettlement : settlement;
  const metricsParticipantCount =
    variant === 'promo' ? promoParticipantCount : participantCount;

  const seasonPhase =
    phaseProp ??
    (metricsOnChainConfig
      ? resolveSeasonZeroLifecyclePhase(metricsOnChainConfig, metricsSettlement)
      : null);
  const seasonIsLive = seasonPhase === 'live';
  const seasonIsUpcoming = seasonPhase === 'upcoming';
  const promoAriaLabel = seasonIsUpcoming
    ? 'Upcoming rally season'
    : seasonIsLive
      ? 'Live rally season standings'
      : 'Rally season';

  const joinDisabled = useMemo(
    () =>
      joinPending ||
      joined ||
      seasonIsUpcoming ||
      joinRoutingLoading ||
      !joinConfigReady ||
      (isConnected && hasLoadedBalance && joinConfigReady && !hasEnoughSocial),
    [
      hasEnoughSocial,
      hasLoadedBalance,
      isConnected,
      joinConfigReady,
      joinPending,
      joinRoutingLoading,
      joined,
      seasonIsUpcoming,
    ]
  );

  const joinButtonLabel = useMemo(() => {
    if (seasonIsUpcoming) return 'Opens soon';
    if (joinRoutingLoading) return 'Loading entry…';
    if (!joinConfigReady || !joinMinAmountLabel) return 'Entry unavailable';
    if (walletLoading) return 'Checking wallet…';
    if (!isConnected) return `Join · ${joinMinAmountLabel} SOCIAL`;
    if (!hasLoadedBalance || balanceLoading) return 'Checking balance…';
    return `Join · ${joinMinAmountLabel} SOCIAL`;
  }, [
    balanceLoading,
    hasLoadedBalance,
    isConnected,
    joinConfigReady,
    joinMinAmountLabel,
    joinRoutingLoading,
    seasonIsUpcoming,
    walletLoading,
  ]);

  const payoutHint = useMemo(() => {
    if (!seasonIsLive) return null;
    return seasonZeroPayoutSummary({
      indexedPoolYocto: metricsIndexedPoolYocto,
      participantCount: metricsParticipantCount,
      includeProspectiveJoin: !joined,
      participants: payoutParticipants ?? undefined,
      personalAccountId:
        personalAccountId ?? (joined ? accountId : null) ?? null,
      personalRank: myStanding?.rank ?? null,
      personalScore: myStanding?.score ?? null,
      routing: joinRouting
        ? {
            joinAmountYocto: joinRouting.joinMinAmountYocto,
            seasonPoolBps: joinRouting.config.season_pool_bps,
          }
        : undefined,
    });
  }, [
    accountId,
    joined,
    joinRouting,
    metricsIndexedPoolYocto,
    metricsParticipantCount,
    myStanding?.rank,
    myStanding?.score,
    payoutParticipants,
    personalAccountId,
    seasonIsLive,
  ]);

  const balanceStatusLine = (() => {
    if (statusLoading) {
      return (
        <div className="flex h-5 min-h-5 items-center">
          {rallyStatusPlaceholder()}
        </div>
      );
    }

    if (isConnected && (!hasLoadedBalance || balanceLoading)) {
      return (
        <div className="flex h-5 min-h-5 items-center">
          {rallyStatusPlaceholder()}
        </div>
      );
    }

    return (
      <p className="min-h-5 text-xs leading-5 text-muted-foreground">
        {isConnected ? (
          <>
            <span className="font-mono font-semibold text-foreground">
              {formatGenesisSocialBalanceDisplay(balanceYocto)}
            </span>
            <span className="text-muted-foreground/60"> SOCIAL</span>
            <span className="text-border"> · </span>
          </>
        ) : null}
        <span className="portal-gold-text font-mono">
          {joinRoutingLoading
            ? '…'
            : joinMinAmountLabel ?? 'Entry unavailable'}
        </span>
        <span className="text-muted-foreground/60">
          {' '}
          entry
          {joinRoutingDisclosure ? ` · ${joinRoutingDisclosure}` : ''}
        </span>
        {payoutHint ? (
          <>
            <span className="text-border"> · </span>
            <span className="text-muted-foreground/75">{payoutHint}</span>
          </>
        ) : null}
        {isConnected ? (
          <>
            <span className="text-border"> · </span>
            <span className={cn(showInsufficientBalance && 'portal-gold-text')}>
              {statusLabel}
            </span>
          </>
        ) : null}
      </p>
    );
  })();

  const claimMetricsStatus = useMemo(
    () =>
      variant === 'page'
        ? resolveSeasonZeroClaimMetricsStatus({
            phase: seasonPhase,
            claim,
            accountId,
            myStanding,
            omitStanding: Boolean(joined && myStanding),
            claimStatusReady: claimStatusResolved,
          })
        : null,
    [
      accountId,
      claim,
      claimStatusResolved,
      joined,
      myStanding,
      seasonPhase,
      variant,
    ]
  );

  const claimMetricsPending =
    variant === 'page' &&
    isPostLiveSeasonPhase(seasonPhase) &&
    !claimStatusResolved;

  const showClaimAction =
    variant === 'page' &&
    seasonPhase === 'claim_open' &&
    Boolean(claim && claim.claimed === false && accountId);

  const promoPanelClass = cn(
    'group relative overflow-hidden transition-[border-color,box-shadow] duration-200',
    'hover:border-[var(--portal-gold-border-strong)] hover:shadow-[0_0_20px_var(--portal-gold-shadow)]',
    className
  );

  const registrySuggestsGoldPanel =
    effectiveRegistryPhase === 'live' || effectiveRegistryPhase === 'upcoming';
  const showGoldPanel =
    seasonIsLive ||
    seasonIsUpcoming ||
    (seasonPhase === null && registrySuggestsGoldPanel);

  const pagePanelClass = cn(
    'overflow-hidden transition-[border-color,box-shadow] duration-300',
    showGoldPanel
      ? 'portal-gold-panel border-[var(--portal-gold-border-strong)] shadow-[0_0_16px_var(--portal-gold-glow)]'
      : 'border-border/40',
    className
  );

  const getSocialLabel = PORTAL_SWAP_ENABLED
    ? 'Get SOCIAL'
    : 'How to get SOCIAL';

  const joinActionButtons = showInsufficientBalance ? (
    <RallyActionSlot wide>
      <Button
        size="sm"
        variant="accent"
        className="h-9 px-4"
        onClick={() => setSwapOpen(true)}
      >
        {getSocialLabel}
      </Button>
    </RallyActionSlot>
  ) : (
    <RallyActionSlot>
      <Button
        size="sm"
        variant="accent"
        className="h-9 w-[7.25rem] px-4"
        disabled={joinDisabled}
        loading={
          joinPending || (isConnected && (!hasLoadedBalance || balanceLoading))
        }
        onClick={() => void handleJoin()}
      >
        {joinButtonLabel}
      </Button>
    </RallyActionSlot>
  );

  const myStandingRewardYocto = myStanding
    ? (publishedRewardByAccountId?.[myStanding.accountId] ?? null)
    : null;

  const footerMode = useMemo((): RallyFooterMode | null => {
    if (awaitingParticipationData) return 'loading';

    if (joined) {
      if (statusLoading || !myStanding) return 'loading';
      return 'joined';
    }

    if (seasonIsUpcoming) {
      if (awaitingParticipationData) return 'loading';
      return 'join';
    }

    if (seasonPhase && seasonPhase !== 'live') {
      if (walletLoading || (variant === 'page' && pageDataReady === false)) {
        return 'loading';
      }
      return !accountId ? 'post-live-connect' : null;
    }

    return 'join';
  }, [
    accountId,
    awaitingParticipationData,
    joined,
    myStanding,
    pageDataReady,
    seasonIsUpcoming,
    seasonPhase,
    statusLoading,
    variant,
    walletLoading,
  ]);

  const hasMetricsRail = Boolean(metricsOnChainConfig);
  const footerShellClass = rallyFooterShellClass(hasMetricsRail);

  const actionFooter =
    footerMode === null ? null : (
      <div className={footerShellClass}>
        <AnimatePresence mode="wait" initial={false}>
          {footerMode === 'loading' ? (
            <motion.div
              key="rally-footer-loading"
              {...rallyFooterFade(reduceMotion)}
              className="px-3 py-2.5 md:px-4"
            >
              <StandingRowSkeleton />
            </motion.div>
          ) : footerMode === 'joined' ? (
            <motion.div
              key="rally-footer-joined"
              {...rallyFooterFade(reduceMotion)}
              className={cn(
                'px-3 md:px-4',
                variant === 'promo' && 'pointer-events-none relative z-[1]'
              )}
            >
              {variant === 'promo' ? (
                <p className="pt-2.5 text-center text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Yours
                </p>
              ) : null}
              <StandingRow
                standing={myStanding!}
                interactive={variant !== 'promo'}
                rewardAmountYocto={myStandingRewardYocto}
              />
              <AnimatePresence initial={false}>
                {showClaimAction && claim ? (
                  <motion.div
                    key="rally-footer-collect"
                    {...rallyFooterFade(reduceMotion, 0.16)}
                  >
                    <SeasonClaimInlineAction
                      claim={claim}
                      variant="rally"
                      settlement={
                        metricsSettlement &&
                        isSeasonSettlementPublished(metricsSettlement)
                          ? metricsSettlement
                          : null
                      }
                      onClaimed={onClaimed}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : footerMode === 'post-live-connect' ? (
            <motion.div
              key="rally-footer-post-live-connect"
              {...rallyFooterFade(reduceMotion)}
              className="px-3 py-2.5 md:px-4"
            >
              <PortalConnectPrompt action="season.claim" />
            </motion.div>
          ) : (
            <motion.div
              key="rally-footer-join"
              {...rallyFooterFade(reduceMotion)}
              className="flex min-h-[4.5rem] flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between md:px-4"
            >
              <div
                className={cn(
                  'min-w-0',
                  variant === 'promo' && 'pointer-events-none'
                )}
              >
                {balanceStatusLine}
              </div>
              <div
                className={cn(
                  'flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-center',
                  variant === 'promo' && 'pointer-events-auto relative z-[1]'
                )}
              >
                {statusLoading ? (
                  <RallyActionSlot>{rallyActionPlaceholder()}</RallyActionSlot>
                ) : (
                  joinActionButtons
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );

  const stripBody = (
    <>
      {variant === 'promo' ? (
        <Link
          href={promoHref}
          prefetch
          aria-label={promoAriaLabel}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-gold-accent)]"
        />
      ) : null}

      {variant === 'promo' ? (
        <div className="pointer-events-none relative z-[1] flex justify-center px-3 py-2 md:px-4">
          <span className="portal-gold-text inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] transition-opacity duration-200 group-hover:opacity-90">
            <Sparkles className="portal-gold-icon h-3.5 w-3.5 shrink-0" />
            {seasonPresentation.pageTitle}
            <ProtocolMotionArrow className="h-3 w-3" />
          </span>
        </div>
      ) : null}

      {metricsOnChainConfig ? (
        <motion.div
          key="rally-metrics-rail"
          {...rallyFooterFade(reduceMotion, 0.22)}
          className={cn(
            variant === 'promo' && 'pointer-events-none relative z-[1]'
          )}
        >
          <SeasonZeroMetricsRail
            onChainConfig={metricsOnChainConfig}
            indexedPoolYocto={metricsIndexedPoolYocto}
            joinPoolYocto={metricsJoinPoolYocto}
            sponsoredPoolYocto={metricsSponsoredPoolYocto}
            joinRoutingBps={joinRouting?.config ?? null}
            settlement={metricsSettlement}
            participantCount={metricsParticipantCount}
            claimStatus={claimMetricsStatus}
            claimStatusPending={claimMetricsPending}
          />
        </motion.div>
      ) : null}

      {actionFooter}
    </>
  );

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SocialSwapModal
        open={swapOpen}
        onOpenChange={setSwapOpen}
        defaultTokenIn="near"
        onSuccess={handleSwapSuccess}
      />
      <SurfacePanel
        radius="xl"
        tone="solid"
        borderTone="strong"
        padding="none"
        className={variant === 'promo' ? promoPanelClass : pagePanelClass}
      >
        {stripBody}
      </SurfacePanel>
    </>
  );
}
