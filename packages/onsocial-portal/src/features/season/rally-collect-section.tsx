import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Gift } from 'lucide-react';
import { CollectCelebration } from '@/components/ui/collect-celebration';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { Button } from '@/components/ui/button';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useSeasonParticipation } from '@/contexts/season-participation-context';
import { useSeasonZeroClaimActions } from '@/features/season/season-zero-claim-actions';
import type { SeasonZeroClaimMetricsStatus } from '@/features/season/season-zero-claim-copy';
import { RallyCollectZoneSkeleton } from '@/features/season/rally-collect-zone-skeleton';
import { resolveRallyCollectZonePreview } from '@/features/season/rally-collect-preview';
import { RallyCollectedFooterFrame } from '@/features/season/rally-collected-footer';
import {
  SEASON_COLLECT_ACTION_ROW_CLASS,
  SEASON_COLLECT_BUTTON_MIN_CLASS,
  SEASON_COLLECT_RALLY_ACTION_MIN_CLASS,
  SEASON_PERSONAL_REWARD_PAD_CLASS,
  resolveCollectedZoneMinClass,
} from '@/features/season/season-page-column';
import type {
  SeasonZeroClaimRecord,
  SeasonZeroLifecyclePhase,
} from '@/features/season/season-zero-types';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import { cn } from '@/lib/utils';

function claimStatusAccentClass(statusLabel: string): string {
  if (statusLabel === 'Collected') {
    return 'portal-gold-text';
  }
  if (statusLabel.endsWith(' SOCIAL')) {
    return 'portal-green-text';
  }
  switch (statusLabel) {
    case 'Reward ready':
    case 'Claims opening soon':
    case 'Rewards finalized':
      return 'portal-green-text';
    case 'Awaiting publish':
    case 'Awaiting settlement':
      return 'portal-blue-text';
    default:
      return 'text-muted-foreground/80';
  }
}

const CLAIM_CELEBRATION_TIMEOUT_MS = 2100;
const REDUCED_MOTION_CLAIM_CELEBRATION_TIMEOUT_MS = 1400;

type ClaimCelebration = { id: number; amountYocto: bigint };

function PersonalRewardZone({
  variant,
  children,
  className,
  compactMinClass = SEASON_COLLECT_BUTTON_MIN_CLASS,
}: {
  variant: 'action' | 'compact' | 'pending';
  children: ReactNode;
  className?: string;
  compactMinClass?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        SEASON_PERSONAL_REWARD_PAD_CLASS,
        variant === 'compact'
          ? compactMinClass
          : SEASON_COLLECT_RALLY_ACTION_MIN_CLASS,
        (variant === 'action' || variant === 'pending') &&
          'relative overflow-visible',
        className
      )}
    >
      {children}
    </div>
  );
}

function CollectActionZone({
  amountLabel,
  claimCelebration,
  claimCelebrationDurationSeconds,
  reduceMotion,
  isButtonVisible,
  isButtonLoading,
  onCollect,
}: {
  amountLabel: string;
  claimCelebration: ClaimCelebration | null;
  claimCelebrationDurationSeconds: number;
  reduceMotion: boolean | null;
  isButtonVisible: boolean;
  isButtonLoading: boolean;
  onCollect: () => void;
}) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-col items-center justify-end overflow-visible',
        SEASON_COLLECT_RALLY_ACTION_MIN_CLASS
      )}
    >
      <CollectCelebration
        active={Boolean(claimCelebration)}
        celebrationKey={claimCelebration?.id ?? 'idle'}
        reduceMotion={reduceMotion}
        durationSeconds={claimCelebrationDurationSeconds}
        icon={<Gift className="h-3 w-3" />}
        className="top-auto bottom-[2.75rem]"
        sweepClassName="top-auto bottom-[3.05rem]"
      >
        +{amountLabel}
      </CollectCelebration>
      <motion.div
        aria-hidden={claimCelebration ? true : undefined}
        animate={
          claimCelebration && !reduceMotion
            ? {
                opacity: 0,
                scale: 0.98,
                filter: 'blur(4px)',
              }
            : claimCelebration
              ? { opacity: 0, scale: 0.98 }
              : {
                  opacity: 1,
                  scale: 1,
                  filter: 'blur(0px)',
                }
        }
        transition={{
          duration: claimCelebration ? 0.32 : 0.36,
          ease: claimCelebration ? [0.4, 0, 1, 1] : [0.22, 1, 0.36, 1],
        }}
        className="flex w-full flex-col items-center"
      >
        <CollectActionRow
          visible={isButtonVisible}
          loading={isButtonLoading}
          onCollect={onCollect}
          compact
        />
      </motion.div>
    </div>
  );
}

function CollectActionRow({
  visible,
  loading,
  onCollect,
  compact = false,
}: {
  visible: boolean;
  loading: boolean;
  onCollect: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center justify-center',
        SEASON_COLLECT_ACTION_ROW_CLASS,
        !compact && 'mt-2',
        !visible && 'invisible pointer-events-none'
      )}
      aria-hidden={!visible}
    >
      <Button
        type="button"
        size="sm"
        variant="accent"
        className="min-w-[8rem] justify-center gap-1.5"
        loading={loading}
        disabled={!visible}
        onClick={onCollect}
      >
        <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Collect
      </Button>
    </div>
  );
}

export function RallyCollectSection({
  phase,
  claim,
  claimStatus = null,
  claimStatusPending = false,
  rewardShownInStanding = false,
  onClaimed,
  className,
}: {
  phase: SeasonZeroLifecyclePhase | null;
  claim: SeasonZeroClaimRecord | null;
  claimStatus?: SeasonZeroClaimMetricsStatus | null;
  claimStatusPending?: boolean;
  /** When true, reward amount is already visible in the standing row above. */
  rewardShownInStanding?: boolean;
  onClaimed?: () => void;
  className?: string;
}) {
  const { deriveSeasonClaim } = useSeasonParticipation();
  const displayClaim = deriveSeasonClaim(claim);
  const locallyClaimed = Boolean(displayClaim?.claimed);

  const showCollectHero =
    phase === 'claim_open' && Boolean(claim && claim.claimed === false);

  const {
    handleClaim,
    phase: collectPhase,
    isButtonVisible,
    isButtonLoading,
    isCollectSettled,
    txResult,
    clearTxResult,
  } = useSeasonZeroClaimActions({
    claim: showCollectHero ? claim : null,
  });

  const reduceMotion = useReducedMotion();
  const onClaimedRef = useRef(onClaimed);
  const pendingClaimedRefreshRef = useRef(false);
  const [claimCelebration, setClaimCelebration] =
    useState<ClaimCelebration | null>(null);
  const claimCelebrationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const celebratedClaimRef = useRef<string | null>(null);
  const claimCelebrationDurationSeconds = reduceMotion ? 1.15 : 1.75;

  useEffect(() => {
    onClaimedRef.current = onClaimed;
  }, [onClaimed]);

  const flushClaimedRefresh = useCallback(() => {
    if (!pendingClaimedRefreshRef.current) return;
    pendingClaimedRefreshRef.current = false;
    onClaimedRef.current?.();
  }, []);

  const clearClaimCelebration = useCallback(() => {
    if (claimCelebrationTimeoutRef.current) {
      clearTimeout(claimCelebrationTimeoutRef.current);
      claimCelebrationTimeoutRef.current = null;
    }
    setClaimCelebration(null);
  }, []);

  const triggerClaimCelebration = useCallback(
    (amountYocto: bigint) => {
      if (amountYocto <= 0n) return;

      if (claimCelebrationTimeoutRef.current) {
        clearTimeout(claimCelebrationTimeoutRef.current);
      }

      const id = Date.now();
      setClaimCelebration({ id, amountYocto });
      claimCelebrationTimeoutRef.current = setTimeout(
        () => {
          setClaimCelebration((current) =>
            current?.id === id ? null : current
          );
          claimCelebrationTimeoutRef.current = null;
          flushClaimedRefresh();
        },
        reduceMotion
          ? REDUCED_MOTION_CLAIM_CELEBRATION_TIMEOUT_MS
          : CLAIM_CELEBRATION_TIMEOUT_MS
      );
    },
    [flushClaimedRefresh, reduceMotion]
  );

  useEffect(() => {
    celebratedClaimRef.current = null;
    pendingClaimedRefreshRef.current = false;
    clearClaimCelebration();
  }, [claim?.accountId, claim?.seasonId, clearClaimCelebration]);

  useEffect(
    () => () => {
      if (claimCelebrationTimeoutRef.current) {
        clearTimeout(claimCelebrationTimeoutRef.current);
      }
      flushClaimedRefresh();
    },
    [flushClaimedRefresh]
  );

  useEffect(() => {
    if (collectPhase !== 'succeeded' || !claim) return;
    const celebrationKey = `${claim.seasonId}:${claim.accountId}`;
    if (celebratedClaimRef.current === celebrationKey) return;
    celebratedClaimRef.current = celebrationKey;
    pendingClaimedRefreshRef.current = true;

    const amountYocto = BigInt(claim.amountYocto);
    if (amountYocto <= 0n) {
      flushClaimedRefresh();
      return;
    }

    triggerClaimCelebration(amountYocto);
  }, [claim, collectPhase, flushClaimedRefresh, triggerClaimCelebration]);

  const celebrationActive = Boolean(claimCelebration);
  const celebrationKey =
    claim != null ? `${claim.seasonId}:${claim.accountId}` : null;
  const needsClaimCelebration =
    collectPhase === 'succeeded' &&
    claim != null &&
    BigInt(claim.amountYocto) > 0n &&
    celebratedClaimRef.current !== celebrationKey;
  const isCollectedReward =
    !celebrationActive &&
    !needsClaimCelebration &&
    (Boolean(claim?.claimed) ||
      (showCollectHero && Boolean(claim) && isCollectSettled));

  let zoneVariant: 'action' | 'compact' | 'pending' = 'compact';
  let zoneContent: ReactNode = null;
  let showTxToast = false;
  let compactMinClass = SEASON_COLLECT_BUTTON_MIN_CLASS;

  if (claimStatusPending) {
    const pendingPreview = resolveRallyCollectZonePreview({
      phase,
      claimClaimed: locallyClaimed ? true : (claim?.claimed ?? null),
    });
    const pendingCollectedMinClass = resolveCollectedZoneMinClass({
      rewardShownInStanding,
      reserveTxLink: false,
    });

    if (pendingPreview === 'button') {
      zoneVariant = 'pending';
      zoneContent = <RallyCollectZoneSkeleton preview="button" shell="inner" />;
    } else {
      zoneVariant = 'compact';
      compactMinClass = pendingCollectedMinClass;
      zoneContent = (
        <RallyCollectZoneSkeleton
          preview="collected"
          shell="inner"
          collectedMinClass={pendingCollectedMinClass}
          reserveTxLink={false}
        />
      );
    }
  } else {
    if (isCollectedReward && claim) {
      const amountLabel = formatGenesisSocialBalanceDisplay(claim.amountYocto);
      const statusHref = claim.claimedTxHash
        ? (claimStatus?.statusHref ?? null)
        : null;

      zoneVariant = 'compact';
      compactMinClass = resolveCollectedZoneMinClass({
        rewardShownInStanding,
        statusHref,
      });
      showTxToast = true;
      zoneContent = (
        <RallyCollectedFooterFrame
          statusLine={
            <span className="font-mono text-sm font-semibold tabular-nums portal-gold-text sm:text-base">
              {rewardShownInStanding
                ? 'Collected'
                : `Collected ${amountLabel} SOCIAL`}
            </span>
          }
          statusHref={statusHref}
          reserveTxLink={false}
        />
      );
    } else if (showCollectHero && claim && !isCollectedReward) {
      const amountLabel = formatGenesisSocialBalanceDisplay(claim.amountYocto);

      zoneVariant = 'action';
      showTxToast = true;
      zoneContent = (
        <CollectActionZone
          amountLabel={amountLabel}
          claimCelebration={claimCelebration}
          claimCelebrationDurationSeconds={claimCelebrationDurationSeconds}
          reduceMotion={reduceMotion}
          isButtonVisible={isButtonVisible}
          isButtonLoading={isButtonLoading}
          onCollect={() => void handleClaim()}
        />
      );
    } else if (claimStatus) {
      const statusHref = claimStatus.statusHref ?? null;
      const isAmountStatus = claimStatus.statusLabel.endsWith(' SOCIAL');
      const showAmountInZone = isAmountStatus && !rewardShownInStanding;
      const statusLabel = showAmountInZone
        ? claimStatus.statusLabel
        : (claimStatus.detailLine ?? claimStatus.statusLabel);
      const showDetailLine =
        Boolean(claimStatus.detailLine) && showAmountInZone && !statusHref;

      zoneContent = (
        <div className="flex flex-col items-center gap-1">
          {statusHref ? (
            <a
              href={statusHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'group/status inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline',
                claimStatusAccentClass(claimStatus.statusLabel)
              )}
            >
              <span
                className={cn(
                  showAmountInZone &&
                    'font-mono text-xl font-bold tracking-[-0.03em] tabular-nums sm:text-2xl'
                )}
              >
                {claimStatus.statusLabel}
              </span>
              <ProtocolMotionArrow className="h-3 w-3" />
            </a>
          ) : (
            <span
              className={cn(
                'text-sm',
                claimStatusAccentClass(
                  showAmountInZone ? claimStatus.statusLabel : statusLabel
                ),
                showAmountInZone &&
                  'font-mono text-xl font-bold tracking-[-0.03em] tabular-nums sm:text-2xl'
              )}
            >
              {statusLabel}
            </span>
          )}
          {showDetailLine ? (
            <p className="portal-type-micro text-muted-foreground/75">
              {claimStatus.detailLine}
            </p>
          ) : null}
        </div>
      );
    }
  }

  if (!zoneContent) {
    return null;
  }

  return (
    <>
      {showTxToast ? (
        <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      ) : null}
      <PersonalRewardZone
        variant={zoneVariant}
        compactMinClass={compactMinClass}
        className={className}
      >
        {zoneContent}
      </PersonalRewardZone>
    </>
  );
}
