'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { useSeasonParticipation } from '@/contexts/season-participation-context';

import { Button } from '@/components/ui/button';
import { PortalConnectPrompt } from '@/components/ui/portal-connect-prompt';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { Skeleton } from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { useSocialWalletBalance } from '@/hooks/use-social-wallet-balance';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import {
  getActiveSeasonId,
  getSeasonCatalogTitle,
  getSeasonPresentation,
  resolveSeasonHeroTitle,
  seasonApiPath,
} from '@/lib/active-season';
import {
  useSeasonRegistry,
  type SeasonPhase,
  resolvePromoSeasonEntry,
  resolvePromoSeasonId,
} from '@/lib/season-registry';
import { fadeMotion, fadeUpMotion } from '@/lib/motion';
import { extractNearTransactionHashes } from '@/lib/near-rpc';
import {
  fetchJoinRallyRouting,
  resolveJoinSpendSplitParts,
  type JoinRallyRoutingDisclosure,
} from '@/lib/join-rally-routing';
import { resolveRallyHeroJoinEntryLabel } from '@/lib/rally-join-entry';
import {
  resolveRallyJoinStandingHint,
  showRallyJoinPreActionFooter,
} from '@/lib/rally-join-copy';
import { resolveRallyHeroTimingMeta } from '@/lib/rally-hero-timing';
import { readTimestampNs } from '@/lib/relative-duration';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { SeasonZeroMetricsRail } from '@/features/season/season-zero-metrics-rail';
import { RallyCollectSection } from '@/features/season/rally-collect-section';
import { RallyHeroHeader } from '@/features/season/rally-hero-header';
import {
  RallyHeroCardSkeleton,
  resolveRallyHeroFooterPreview,
} from '@/features/season/rally-hero-card-skeleton';
import { RallyPersonalZoneSkeleton } from '@/features/season/rally-personal-zone-skeleton';
import type { RallyCollectZonePreview } from '@/features/season/rally-collect-preview';
import { resolveRallyCollectZonePreview } from '@/features/season/rally-collect-preview';
import { RallyPositionSummary } from '@/features/season/rally-position-summary';
import {
  StandingRow,
  StandingRowSkeleton,
  type SeasonZeroStanding,
} from '@/features/season/season-zero-standing-row';
import type {
  SeasonTreasurySeedSource,
  SeasonZeroClaimRecord,
  SeasonZeroLifecyclePhase,
  SeasonZeroOnChainConfig,
  SeasonZeroSettlementSummary,
  SeasonZeroStatusPayload,
} from '@/features/season/season-zero-types';
import {
  isPostLiveSeasonPhase,
  resolveSeasonZeroClaimMetricsStatus,
} from '@/features/season/season-zero-claim-copy';
import { SeasonRallyPulse } from '@/features/season/season-rally-pulse';
import { rallyPoolBreakdownVisible } from '@/features/season/rally-pool-breakdown';
import {
  RallyJoinFooterFrame,
  RallyJoinFooterSkeleton,
} from '@/features/season/rally-join-footer-skeleton';
import {
  RallyJoinActionSection,
  RallyJoinContextBlock,
} from '@/features/season/rally-join-footer-status-line';
import {
  isPostLiveRegistryPhase,
  resolveRallyHeroCardMinClass,
  resolveRallyJoinedFooterMinClass,
  SEASON_COLLECT_ACTION_ROW_CLASS,
} from '@/features/season/season-page-column';
import { seasonZeroPayoutSummary } from '@/features/season/season-zero-payout-copy';
import type { SeasonZeroPayoutParticipant } from '@/features/season/season-zero-payout-estimate';
import { isSeasonSettlementPublished } from '@/features/season/season-zero-types';
import { useSeasonZeroLifecyclePhase } from '@/features/season/use-season-zero-lifecycle-phase';
import { cn } from '@/lib/utils';

const os = createPortalOnSocialClient();

function rallyStatusPlaceholder() {
  return (
    <Skeleton
      className="h-3.5 w-[13rem] max-w-full rounded-full bg-foreground/[0.06]"
      aria-hidden
    />
  );
}

function RallyActionSlot({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center',
        SEASON_COLLECT_ACTION_ROW_CLASS
      )}
    >
      {children}
    </div>
  );
}

function rallyActionPlaceholder() {
  return (
    <Skeleton
      className="h-9 min-w-[8rem] rounded-full bg-foreground/[0.06]"
      aria-hidden
    />
  );
}

type RallyFooterMode = 'loading' | 'joined' | 'post-live-connect' | 'join';

function rallyFooterFade(reduceMotion: boolean | null, duration = 0.18) {
  return fadeMotion(reduceMotion ? 0 : duration);
}

function rallyFooterShellClass(_hasMetrics: boolean) {
  return undefined;
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
  seasonJoinEntryYocto = null,
  settlement = null,
  participantCount = 0,
  treasurySeedSource = null,
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
  onOpenRules,
  onJumpToStandings,
  standingPulse = false,
  onMyStandingChange,
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
  /** Indexed minimum join spend for this season (from status API). */
  seasonJoinEntryYocto?: string | null;
  settlement?: SeasonZeroSettlementSummary | null;
  participantCount?: number;
  /** Governance proposal or tx that seeded the treasury pool (from status API). */
  treasurySeedSource?: SeasonTreasurySeedSource | null;
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
  onOpenRules?: () => void;
  onJumpToStandings?: () => void;
  /** Brief pulse on the hero standing row (scroll-back from standings). */
  standingPulse?: boolean;
  /** Sync resolved standing to the page (for standings cross-links). */
  onMyStandingChange?: (standing: SeasonZeroStanding | null) => void;
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
    deriveSeasonClaim,
    participateSyncVersion,
  } = useSeasonParticipation();
  const [loading, setLoading] = useState(true);
  const [apiJoined, setApiJoined] = useState(false);
  const joined = useMemo(
    () =>
      resolveSeasonJoinedFor(seasonId, apiJoined || Boolean(myStandingProp)),
    [
      apiJoined,
      myStandingProp,
      resolveSeasonJoinedFor,
      seasonId,
      participateSyncVersion,
    ]
  );
  const joinPending = isSeasonJoinPending(seasonId);
  const [fetchedMyStanding, setFetchedMyStanding] =
    useState<SeasonZeroStanding | null>(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [promoOnChainConfig, setPromoOnChainConfig] =
    useState<SeasonZeroOnChainConfig | null>(null);
  const [promoIndexedPoolYocto, setPromoIndexedPoolYocto] = useState('0');
  const [promoJoinPoolYocto, setPromoJoinPoolYocto] = useState('0');
  const [promoSponsoredPoolYocto, setPromoSponsoredPoolYocto] = useState('0');
  const [promoSettlement, setPromoSettlement] =
    useState<SeasonZeroSettlementSummary | null>(null);
  const [promoParticipantCount, setPromoParticipantCount] = useState(0);
  const [promoTreasurySeedSource, setPromoTreasurySeedSource] =
    useState<SeasonTreasurySeedSource | null>(null);
  const [promoStatusReady, setPromoStatusReady] = useState(variant !== 'promo');
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
      })
      .catch(() => {
        if (!cancelled) {
          setJoinRouting(null);
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

  useEffect(() => {
    if (variant !== 'page') return;
    onMyStandingChange?.(myStanding);
  }, [myStanding, onMyStandingChange, variant]);

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
    if (variant === 'page') {
      if (!pageDataReady || walletLoading) {
        setLoading(true);
        return;
      }
      if (myStandingProp) {
        setApiJoined(true);
        reconcileSeasonJoinFromApi(seasonId, true);
      }
      setLoading(false);
      return;
    }

    if (myStandingProp) {
      setApiJoined(true);
      setLoading(false);
      return;
    }

    setApiJoined(false);
    setFetchedMyStanding(null);
    setLoading(true);
    void refresh();
  }, [
    accountId,
    myStandingProp,
    pageDataReady,
    reconcileSeasonJoinFromApi,
    refresh,
    seasonId,
    variant,
    walletLoading,
  ]);

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
          setPromoTreasurySeedSource(statusData.treasurySeedSource ?? null);
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
          setPromoTreasurySeedSource(null);
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
    variant === 'page'
      ? pageDataReady === false || walletLoading
      : !promoStatusReady || walletLoading;
  const claimStatusResolved =
    claimStatusReady && !walletLoading && pageDataReady !== false;
  const statusLoading =
    variant === 'page'
      ? !myStandingProp && (loading || pageDataReady === false)
      : loading || awaitingParticipationData;
  const joinConfigReady = joinRouting != null;
  const joinMinAmountYocto = joinRouting?.joinMinAmountYocto ?? null;
  const joinMinAmountLabel = joinRouting?.joinMinAmountSocialLabel ?? null;
  const hasEnoughSocial =
    joinMinAmountYocto != null && balanceYocto >= joinMinAmountYocto;

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

  const metricsOnChainConfig =
    variant === 'promo' ? promoOnChainConfig : onChainConfig;
  const metricsIndexedPoolYocto =
    variant === 'promo' ? promoIndexedPoolYocto : indexedPoolYocto;
  const metricsJoinPoolYocto =
    variant === 'promo' ? promoJoinPoolYocto : joinPoolYocto;
  const metricsSponsoredPoolYocto =
    variant === 'promo' ? promoSponsoredPoolYocto : sponsoredPoolYocto;
  const metricsTreasurySeedSource =
    variant === 'promo' ? promoTreasurySeedSource : treasurySeedSource;
  const metricsSettlement = variant === 'promo' ? promoSettlement : settlement;
  const metricsParticipantCount =
    variant === 'promo' ? promoParticipantCount : participantCount;

  const resolvedPhaseFromHook = useSeasonZeroLifecyclePhase(
    metricsOnChainConfig,
    metricsSettlement
  );
  const seasonPhase = phaseProp ?? resolvedPhaseFromHook;
  const seasonIsLive = seasonPhase === 'live';
  const seasonIsUpcoming = seasonPhase === 'upcoming';
  const showInsufficientBalance =
    !seasonIsUpcoming &&
    isConnected &&
    hasLoadedBalance &&
    joinConfigReady &&
    !hasEnoughSocial &&
    !joined &&
    !statusLoading;
  const heroTitle = useMemo(
    () =>
      resolveSeasonHeroTitle({
        seasonId,
        onChainLabel: metricsOnChainConfig?.label ?? registryEntry?.label,
        catalogTitle: getSeasonCatalogTitle(seasonId),
      }),
    [metricsOnChainConfig?.label, registryEntry?.label, seasonId]
  );
  const heroJoinEntryLabel = useMemo(
    () =>
      resolveRallyHeroJoinEntryLabel({
        phase: seasonPhase,
        seasonJoinEntryYocto,
        currentJoinEntryLabel: joinMinAmountLabel,
        formatYocto: formatGenesisSocialBalanceDisplay,
      }),
    [joinMinAmountLabel, seasonJoinEntryYocto, seasonPhase]
  );
  const heroJoinEntryLoading =
    seasonPhase === 'upcoming' || seasonPhase === 'live'
      ? joinRoutingLoading
      : false;
  const heroTimingMeta = useMemo(
    () =>
      resolveRallyHeroTimingMeta({
        phase: seasonPhase,
        startsAtNs: readTimestampNs(metricsOnChainConfig?.starts_at_ns),
        endsAtNs: readTimestampNs(metricsOnChainConfig?.ends_at_ns),
      }),
    [
      metricsOnChainConfig?.ends_at_ns,
      metricsOnChainConfig?.starts_at_ns,
      seasonPhase,
    ]
  );
  const heroTimingMetaLoading =
    variant === 'page' && (!metricsOnChainConfig || !seasonPhase);
  const promoAriaLabel = seasonIsUpcoming
    ? 'Upcoming rally season'
    : seasonIsLive
      ? 'Live rally season standings'
      : 'Rally season';

  const heroBreakdownStripVisible = rallyPoolBreakdownVisible({
    joinPoolYocto: metricsJoinPoolYocto,
    sponsoredPoolYocto: metricsSponsoredPoolYocto,
    joinRouting: joinRouting?.config ?? null,
    protocolFeesRouteToBoost: joinRouting?.protocolFeesRouteToBoost ?? false,
    joinEntryLabel: heroJoinEntryLabel,
    joinEntryLoading: heroJoinEntryLoading,
  });

  const heroStripShowsEntry =
    variant === 'page' &&
    heroBreakdownStripVisible &&
    (heroJoinEntryLoading || Boolean(heroJoinEntryLabel?.trim()));

  const joinSpendSplitParts = useMemo(
    () => (joinRouting ? resolveJoinSpendSplitParts(joinRouting) : null),
    [joinRouting]
  );

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
    if (!joinConfigReady || !joinMinAmountLabel) return 'Entry unavailable';
    return `Join · ${joinMinAmountLabel} SOCIAL`;
  }, [joinConfigReady, joinMinAmountLabel, seasonIsUpcoming]);

  const joinButtonContentReady = useMemo(() => {
    if (walletLoading) return false;
    if (seasonIsUpcoming) return true;
    if (joinRoutingLoading) return false;
    if (!joinConfigReady || !joinMinAmountLabel) return true;
    if (isConnected && (!hasLoadedBalance || balanceLoading)) return false;
    return true;
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

  const showJoinActionSkeleton = statusLoading || !joinButtonContentReady;

  const joinShortfallLabel = useMemo(() => {
    if (!showInsufficientBalance) return null;
    return socialShortfallYocto > 0n
      ? `Need ${formatGenesisSocialBalanceDisplay(socialShortfallYocto)} more SOCIAL`
      : 'Need SOCIAL';
  }, [showInsufficientBalance, socialShortfallYocto]);

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

  const joinFooterStatusLoading =
    statusLoading || (isConnected && (!hasLoadedBalance || balanceLoading));

  const joinActionButton = (
    <Button
      size="sm"
      variant="accent"
      className="min-w-[10rem] justify-center"
      disabled={joinDisabled}
      loading={joinPending}
      onClick={() => void handleJoin()}
    >
      {joinButtonLabel}
    </Button>
  );

  const joinPreActionFooter = showRallyJoinPreActionFooter({
    joined,
    seasonIsLive,
    seasonIsUpcoming,
  });

  const joinStandingHint = resolveRallyJoinStandingHint({
    joined,
    seasonIsLive,
    seasonIsUpcoming,
  });

  const joinFooterContext =
    variant === 'promo' ? null : (
      <RallyJoinContextBlock
        joinSpendSplitParts={joinSpendSplitParts}
        joinSpendSplitLoading={joinRoutingLoading}
        joinEntryLabel={joinMinAmountLabel}
        entryInHero={heroStripShowsEntry}
        contextHint={joinStandingHint}
        contextHintLoading={joinPreActionFooter && joinRoutingLoading}
        reserveLayout={joinPreActionFooter}
      />
    );

  const joinFooterAction = (
    <RallyJoinActionSection
      compact={variant === 'promo'}
      shortfallLabel={joinShortfallLabel}
      showGetSocial={showInsufficientBalance}
      shortfallLoading={
        joinFooterStatusLoading && isConnected && showInsufficientBalance
      }
      action={
        showJoinActionSkeleton ? (
          <RallyActionSlot>{rallyActionPlaceholder()}</RallyActionSlot>
        ) : (
          joinActionButton
        )
      }
    />
  );

  const joinFooter = (
    <RallyJoinFooterFrame
      compact={variant === 'promo'}
      context={joinFooterContext}
      action={joinFooterAction}
    />
  );

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
    !claimStatusResolved &&
    claim == null;

  const showPublishedRewards = isSeasonSettlementPublished(metricsSettlement);

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
    'overflow-hidden transition-[border-color] duration-300',
    showGoldPanel ? 'border-[var(--portal-gold-border)]' : 'border-border/40',
    className
  );

  const myStandingRewardYocto = myStanding
    ? (publishedRewardByAccountId?.[myStanding.accountId] ?? null)
    : null;

  const claimRewardYocto =
    claim && BigInt(claim.amountYocto) > 0n ? claim.amountYocto : null;

  const standingRewardYocto = showPublishedRewards
    ? (myStandingRewardYocto ?? claimRewardYocto)
    : seasonPhase === 'claim_open' && claim?.claimed === false
      ? claimRewardYocto
      : null;

  const standingRewardProminent = Boolean(
    seasonPhase === 'claim_open' && claim && claim.claimed === false
  );

  const reserveStandingRewardSlot = Boolean(
    standingRewardProminent ||
      claimMetricsPending ||
      (standingRewardYocto != null && BigInt(standingRewardYocto) > 0n) ||
      (variant === 'page' &&
        Boolean(myStanding) &&
        standingRewardYocto == null &&
        (showPublishedRewards ||
          (isPostLiveSeasonPhase(seasonPhase) && pageDataReady === false)))
  );

  const joinedFooterReady = Boolean(
    myStanding &&
      (!isPostLiveSeasonPhase(seasonPhase) ||
        (claimStatusResolved &&
          (!reserveStandingRewardSlot ||
            standingRewardYocto != null ||
            (pageDataReady === true && showPublishedRewards))))
  );

  const joinedPersonalZoneReady =
    variant !== 'page' ||
    !isPostLiveSeasonPhase(seasonPhase) ||
    !accountId ||
    claimStatusResolved;

  const postLiveBrowseContext =
    isPostLiveSeasonPhase(seasonPhase) ||
    (seasonPhase == null && isPostLiveRegistryPhase(effectiveRegistryPhase));

  const footerMode = useMemo((): RallyFooterMode | null => {
    if (awaitingParticipationData) return 'loading';

    if (joined) {
      if (variant === 'page' && myStanding) {
        return 'joined';
      }
      if (statusLoading || !myStanding || !joinedPersonalZoneReady)
        return 'loading';
      return 'joined';
    }

    if (seasonIsUpcoming) {
      if (awaitingParticipationData) return 'loading';
      return 'join';
    }

    if (postLiveBrowseContext) {
      if (walletLoading || (variant === 'page' && pageDataReady === false)) {
        return 'loading';
      }
      if (!accountId) return 'post-live-connect';
      if (
        statusLoading ||
        (joined && (!myStanding || !joinedPersonalZoneReady))
      ) {
        return 'loading';
      }
      return null;
    }

    return 'join';
  }, [
    accountId,
    awaitingParticipationData,
    joined,
    joinedPersonalZoneReady,
    myStanding,
    pageDataReady,
    postLiveBrowseContext,
    seasonIsUpcoming,
    statusLoading,
    variant,
    walletLoading,
  ]);

  const heroFooterPreview = useMemo(
    () =>
      resolveRallyHeroFooterPreview({
        footerMode,
        joined,
        seasonPhase,
        registryPhase: effectiveRegistryPhase,
        accountId,
        walletLoading,
        statusLoading,
        apiJoined,
        seasonIsUpcoming,
      }),
    [
      accountId,
      apiJoined,
      effectiveRegistryPhase,
      footerMode,
      joined,
      seasonIsUpcoming,
      seasonPhase,
      statusLoading,
      walletLoading,
    ]
  );

  const pageCardRevealKeyRef = useRef<string | null>(null);

  useEffect(() => {
    pageCardRevealKeyRef.current = null;
  }, [seasonId]);

  const pageCardRevealedForSeason = pageCardRevealKeyRef.current === seasonId;

  const postLiveBrowseNotJoined =
    postLiveBrowseContext && !joined && Boolean(accountId);

  const pageCardShellLoading =
    variant === 'page' &&
    !pageCardRevealedForSeason &&
    (walletLoading ||
      !pageDataReady ||
      !metricsOnChainConfig ||
      (footerMode === 'loading' && !postLiveBrowseNotJoined) ||
      (footerMode === 'joined' && !joinedFooterReady));

  const resolvedHeroCardFooterPreview = pageCardShellLoading
    ? heroFooterPreview
    : footerMode === 'joined'
      ? 'joined'
      : footerMode === 'join'
        ? 'join'
        : footerMode === 'post-live-connect'
          ? 'connect'
          : 'none';

  const pageHeroCardMinClass =
    variant === 'page'
      ? resolveRallyHeroCardMinClass(resolvedHeroCardFooterPreview)
      : undefined;

  useEffect(() => {
    if (
      variant === 'page' &&
      !pageCardShellLoading &&
      metricsOnChainConfig &&
      reduceMotion
    ) {
      pageCardRevealKeyRef.current = seasonId;
    }
  }, [
    metricsOnChainConfig,
    pageCardShellLoading,
    reduceMotion,
    seasonId,
    variant,
  ]);

  const displayClaim = useMemo(
    () => deriveSeasonClaim(claim),
    [claim, deriveSeasonClaim, participateSyncVersion]
  );

  const heroCollectPreview: RallyCollectZonePreview = useMemo(
    () =>
      resolveRallyCollectZonePreview({
        phase: seasonPhase,
        claimClaimed: displayClaim?.claimed ?? claim?.claimed ?? null,
      }),
    [claim?.claimed, displayClaim?.claimed, seasonPhase]
  );

  const heroRewardShownInStanding = Boolean(standingRewardYocto);
  const heroReserveRewardSlot =
    reserveStandingRewardSlot ||
    (variant === 'page' &&
      (isPostLiveSeasonPhase(seasonPhase) ||
        footerMode === 'loading' ||
        (pageCardShellLoading && Boolean(myStanding))));
  const heroRewardSlotLoading = Boolean(
    claimMetricsPending ||
      standingRewardProminent ||
      (showPublishedRewards &&
        Boolean(myStanding) &&
        standingRewardYocto == null &&
        pageDataReady === false)
  );

  const renderPageJoinedFooter = () => (
    <div className={resolveRallyJoinedFooterMinClass(heroCollectPreview)}>
      <RallyPositionSummary
        standing={myStanding!}
        rewardAmountYocto={standingRewardYocto || null}
        rewardProminent={standingRewardProminent}
        reserveRewardSlot={heroReserveRewardSlot}
        rewardSlotLoading={heroRewardSlotLoading}
        payoutHint={seasonIsLive ? payoutHint : null}
        onOpenRules={onOpenRules}
        onJumpToStandings={onJumpToStandings}
        standingPulse={standingPulse}
      />
      <RallyCollectSection
        phase={seasonPhase}
        claim={claim}
        claimStatus={claimMetricsStatus}
        claimStatusPending={claimMetricsPending}
        rewardShownInStanding={Boolean(standingRewardYocto)}
        onClaimed={onClaimed}
      />
    </div>
  );

  const renderPageJoinFooter = () => joinFooter;

  const renderPageActionFooter = () => {
    if (footerMode === null) return null;
    if (footerMode === 'joined' && myStanding) {
      return renderPageJoinedFooter();
    }
    if (footerMode === 'post-live-connect') {
      return (
        <div className="px-3 py-2.5 md:px-4">
          <PortalConnectPrompt action="season.claim" />
        </div>
      );
    }
    if (footerMode === 'join') {
      return renderPageJoinFooter();
    }
    if (footerMode === 'loading' && postLiveBrowseContext && !joined) {
      return null;
    }
    return (
      <RallyPersonalZoneSkeleton
        collectPreview={heroCollectPreview}
        reserveRewardSlot={heroReserveRewardSlot}
        rewardSlotLoading={heroRewardSlotLoading}
        rewardShownInStanding={heroRewardShownInStanding}
        reserveTxLink={false}
      />
    );
  };

  const hasMetricsRail =
    Boolean(metricsOnChainConfig) ||
    (variant === 'page' && pageCardShellLoading);
  const footerShellClass = rallyFooterShellClass(hasMetricsRail);

  const actionFooter =
    footerMode === null ? null : variant === 'page' ? (
      <div className={footerShellClass}>{renderPageActionFooter()}</div>
    ) : (
      <div className={footerShellClass}>
        <AnimatePresence mode="wait" initial={false}>
          {footerMode === 'loading' ? (
            <motion.div
              key="rally-footer-loading"
              {...rallyFooterFade(reduceMotion)}
            >
              <div className="px-3 py-2.5 md:px-4">
                <StandingRowSkeleton />
              </div>
            </motion.div>
          ) : footerMode === 'joined' ? (
            <motion.div
              key="rally-footer-joined"
              {...rallyFooterFade(reduceMotion)}
              className={cn(
                'px-3 md:px-4',
                'pointer-events-none relative z-[1]'
              )}
            >
              <p className="pt-2.5 text-center text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Yours
              </p>
              <StandingRow
                standing={myStanding!}
                interactive={false}
                rewardAmountYocto={myStandingRewardYocto}
              />
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
              className="relative z-[1]"
            >
              <div className="pointer-events-auto w-full">{joinFooter}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );

  const rallyCardRevealMotion = fadeUpMotion(Boolean(reduceMotion), {
    distance: 0,
    duration: 0.28,
  });

  const animatePageCardReveal =
    !reduceMotion && pageCardRevealKeyRef.current !== seasonId;

  const pageHeroCardContent = (
    <>
      <RallyHeroHeader
        displayTitle={heroTitle.title}
        timingMeta={heroTimingMeta?.label ?? null}
        timingMetaTitle={heroTimingMeta?.title ?? null}
        timingMetaLoading={heroTimingMetaLoading}
      />
      <SeasonRallyPulse
        onChainConfig={metricsOnChainConfig!}
        indexedPoolYocto={metricsIndexedPoolYocto}
        joinPoolYocto={metricsJoinPoolYocto}
        sponsoredPoolYocto={metricsSponsoredPoolYocto}
        joinRouting={joinRouting?.config ?? null}
        protocolFeesRouteToBoost={
          joinRouting?.protocolFeesRouteToBoost ?? false
        }
        settlement={metricsSettlement}
        participantCount={metricsParticipantCount}
        joinEntryLabel={heroJoinEntryLabel}
        joinEntryLoading={heroJoinEntryLoading}
        treasurySeedSource={metricsTreasurySeedSource}
      />
      {actionFooter}
    </>
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

      {variant === 'page' ? (
        <div className={cn(pageHeroCardMinClass)}>
          {pageCardShellLoading ? (
            <RallyHeroCardSkeleton
              footerPreview={heroFooterPreview}
              collectPreview={heroCollectPreview}
              reserveRewardSlot={heroReserveRewardSlot}
              rewardShownInStanding={heroRewardShownInStanding}
              reserveTxLink={false}
            />
          ) : (
            <motion.div
              key={`rally-page-card-${seasonId}`}
              initial={
                animatePageCardReveal ? rallyCardRevealMotion.initial : false
              }
              animate={rallyCardRevealMotion.animate}
              transition={rallyCardRevealMotion.transition}
              onAnimationComplete={() => {
                pageCardRevealKeyRef.current = seasonId;
              }}
            >
              {pageHeroCardContent}
            </motion.div>
          )}
        </div>
      ) : null}

      {variant === 'promo' && metricsOnChainConfig ? (
        <motion.div
          key="rally-metrics-rail"
          {...rallyFooterFade(reduceMotion, 0.22)}
          className="pointer-events-none relative z-[1]"
        >
          <SeasonZeroMetricsRail
            onChainConfig={metricsOnChainConfig}
            indexedPoolYocto={metricsIndexedPoolYocto}
            joinPoolYocto={metricsJoinPoolYocto}
            sponsoredPoolYocto={metricsSponsoredPoolYocto}
            joinRouting={joinRouting?.config ?? null}
            protocolFeesRouteToBoost={
              joinRouting?.protocolFeesRouteToBoost ?? false
            }
            settlement={metricsSettlement}
            participantCount={metricsParticipantCount}
            claimStatus={claimMetricsStatus}
            claimStatusPending={claimMetricsPending}
            treasurySeedSource={metricsTreasurySeedSource}
          />
        </motion.div>
      ) : null}

      {variant === 'promo' ? actionFooter : null}
    </>
  );

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel
        radius="xl"
        tone="soft"
        borderTone={showGoldPanel ? 'strong' : 'subtle'}
        padding="none"
        className={variant === 'promo' ? promoPanelClass : pagePanelClass}
      >
        {stripBody}
      </SurfacePanel>
    </>
  );
}
