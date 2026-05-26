'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PenLine, User } from 'lucide-react';
import type { MaterialisedProfile, EndorsementBuildInput } from '@onsocial/sdk';
import { Button } from '@/components/ui/button';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { profileActionButtonClass } from '@/components/ui/profile-action-pill';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import {
  NetworkModal,
  type NetworkAccount,
} from '@/components/network-modal';
import {
  ProfileEndorsements,
  type EndorsementsModalIntent,
} from '@/components/profile-endorsements';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import type { StandingUpdateResult } from '@/hooks/use-profile';
import {
  commitmentLabel,
  formatReputation,
  formatScore,
  reputationTier,
  type ReputationEntry,
} from '@/lib/leaderboard';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface PortalProfileResponse {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
}

interface StandingAccountSummary {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
  viewerStanding?: boolean;
}

interface ProfileSocialResponse {
  accountId: string;
  viewerAccountId: string | null;
  viewerStanding: boolean;
  counts: {
    incoming: number;
    outgoing: number;
  };
  incoming: StandingAccountSummary[];
  outgoing: StandingAccountSummary[];
}

interface ProfileSignalsResponse {
  accountId: string;
  reputation: ReputationEntry | null;
}

interface ProfileModalProps {
  open: boolean;
  accountId: string | null;
  viewerAccountId: string | null;
  selfProfile: MaterialisedProfile | null;
  selfAvatarUrl: string | null;
  hasSocialSession?: boolean;
  isUpdatingStanding?: boolean;
  onOpenChange: (open: boolean) => void;
  onEditProfile: () => void;
  onSelectAccount?: (accountId: string) => void;
  onDiscoverProfiles?: () => void;
  onUpdateStanding: (
    accountId: string,
    shouldStand: boolean
  ) => Promise<StandingUpdateResult>;
  onEndorse?: (
    target: string,
    input: EndorsementBuildInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (target: string, topic?: string) => Promise<unknown>;
}

type StanceDetailKind = 'incoming' | 'outgoing' | 'mutual';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile request failed';
}

async function fetchPortalProfile(
  accountId: string
): Promise<PortalProfileResponse> {
  const response = await fetch(
    `/api/profile?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<PortalProfileResponse> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ?? body?.error ?? `Profile query failed (${response.status})`
    );
  }

  return {
    accountId,
    profile: body?.profile ?? null,
    avatarUrl: body?.avatarUrl ?? null,
  };
}

async function fetchProfileSocial(
  accountId: string,
  viewerAccountId: string | null
): Promise<ProfileSocialResponse> {
  const search = new URLSearchParams({ accountId });
  if (viewerAccountId) search.set('viewerAccountId', viewerAccountId);

  const response = await fetch(`/api/profile/social?${search.toString()}`, {
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<ProfileSocialResponse> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Social graph query failed (${response.status})`
    );
  }

  const normalizeAccounts = (
    accounts: StandingAccountSummary[] | undefined
  ): StandingAccountSummary[] =>
    (accounts ?? []).map((account) => ({
      ...account,
      viewerStanding: Boolean(account.viewerStanding),
    }));

  return {
    accountId,
    viewerAccountId: body?.viewerAccountId ?? null,
    viewerStanding: Boolean(body?.viewerStanding),
    counts: {
      incoming: Number(body?.counts?.incoming ?? 0),
      outgoing: Number(body?.counts?.outgoing ?? 0),
    },
    incoming: normalizeAccounts(body?.incoming),
    outgoing: normalizeAccounts(body?.outgoing),
  };
}

async function fetchProfileSignals(
  accountId: string
): Promise<ProfileSignalsResponse> {
  const response = await fetch(
    `/api/profile/signals?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<ProfileSignalsResponse> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Profile signals query failed (${response.status})`
    );
  }

  return {
    accountId,
    reputation: body?.reputation ?? null,
  };
}

function displayName(
  profile: MaterialisedProfile | null,
  accountId: string | null
): string {
  if (profile?.name?.trim()) return profile.name.trim();
  return accountId ? cleanHandle(accountId) : 'OnSocial account';
}

function cleanHandle(accountId: string): string {
  return accountId.replace(/\.(testnet|near)$/u, '');
}

function formatCount(count: number): string {
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return '0';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits:
      Math.abs(numericCount) >= 1000 && Math.abs(numericCount) < 100000 ? 1 : 0,
    notation: Math.abs(numericCount) >= 1000 ? 'compact' : 'standard',
  }).format(numericCount);
}

function formatNumericCompact(value: string | number): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue === 0) return '0';
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: numericValue >= 100 ? 0 : 1,
  }).format(numericValue);
}

function toFiniteNumber(value: string | number): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function accountLabel(account: StandingAccountSummary): string {
  return account.name?.trim() || cleanHandle(account.accountId);
}

function accountGradient(accountId: string): string {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = ((hash << 5) - hash + accountId.charCodeAt(i)) | 0;
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 8) % 30)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 45% 60% / 0.14), hsl(${h2} 35% 55% / 0.08), transparent 80%)`;
}

function EmptyState({
  children,
  cta,
}: {
  children: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/45 bg-muted/18 px-3 py-3 text-xs text-muted-foreground">
      {children}
      {cta ? <div className="mt-2">{cta}</div> : null}
    </div>
  );
}

function ProfileIdentityLoading() {
  return (
    <>
      <div className="h-24 bg-foreground/[0.03]" />
      <div className="-mt-10 space-y-3 px-4 pb-5 md:px-5">
        <div className="flex items-end gap-3.5">
          <Skeleton className="h-[68px] w-[68px] shrink-0 rounded-2xl ring-[3px] ring-background" />
          <div className="min-w-0 flex-1 space-y-1.5 pb-1">
            <Skeleton className="h-5 w-36 max-w-full bg-foreground/10" />
            <Skeleton className="h-3 w-48 max-w-full bg-foreground/[0.06]" />
          </div>
        </div>
        <SkeletonText
          lines={2}
          className="max-w-md"
          widths={['w-full', 'w-3/5']}
        />
        <Skeleton className="h-7 w-28 rounded-full bg-foreground/[0.07]" />
        <div className="space-y-2">
          <div className="flex items-start gap-6">
            <div className="space-y-1.5">
              <Skeleton className="h-2 w-14" />
              <div className="flex gap-1.5">
                <Skeleton className="h-4 w-8 rounded" />
                <Skeleton className="h-4 w-8 rounded" />
                <Skeleton className="h-4 w-6 rounded" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-2 w-20" />
              <div className="flex gap-1.5">
                <Skeleton className="h-4 w-8 rounded" />
                <Skeleton className="h-4 w-8 rounded" />
              </div>
            </div>
          </div>
          <div className="flex -space-x-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-5 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function AccountAvatar({
  avatarUrl,
  className,
}: {
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 text-muted-foreground',
        className
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className="h-4 w-4" />
      )}
    </div>
  );
}

function SocialProofStrip({
  social,
  endorsementCount,
  givenEndorsementCount,
  isSelf,
  onOpenStanceDetail,
  onOpenNetwork,
  onOpenEndorsements,
}: {
  social: ProfileSocialResponse;
  endorsementCount: number;
  givenEndorsementCount: number;
  isSelf: boolean;
  onOpenStanceDetail: (kind: StanceDetailKind) => void;
  onOpenNetwork: () => void;
  onOpenEndorsements: (
    mode: EndorsementsModalIntent['mode'],
    topic?: string
  ) => void;
}) {
  const incomingCount = social.counts.incoming;
  const outgoingCount = social.counts.outgoing;

  const mutualCount = useMemo(() => {
    const outgoingSet = new Set(social.outgoing.map((a) => a.accountId));
    return social.incoming.filter((a) => outgoingSet.has(a.accountId)).length;
  }, [social]);

  const previewAccounts = useMemo(() => {
    const seen = new Set<string>();
    const result: StandingAccountSummary[] = [];
    for (const account of [...social.incoming, ...social.outgoing]) {
      if (!seen.has(account.accountId)) {
        seen.add(account.accountId);
        result.push(account);
      }
      if (result.length >= 5) break;
    }
    return result;
  }, [social]);

  const overflowCount =
    social.incoming.length +
    social.outgoing.length -
    mutualCount -
    previewAccounts.length;

  const metricBtn =
    'group inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1';
  const columnLabel =
    'text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/45';

  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div>
          <div className={columnLabel}>Standing</div>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12px]">
            <button
              type="button"
              onClick={() => onOpenStanceDetail('incoming')}
              className={cn(metricBtn, 'focus-visible:ring-[var(--portal-blue-focus-border)]')}
              aria-label={isSelf ? `${formatCount(incomingCount)} stand with you` : `${formatCount(incomingCount)} stand with them`}
              title="Stand with them"
            >
              <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]" />
              <span className={cn('font-bold tabular-nums text-[var(--portal-blue)]', incomingCount === 0 && 'opacity-40')}>
                {formatCount(incomingCount)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onOpenStanceDetail('outgoing')}
              className={cn(metricBtn, 'focus-visible:ring-[var(--portal-blue-focus-border)]')}
              aria-label={isSelf ? `You stand with ${formatCount(outgoingCount)}` : `They stand with ${formatCount(outgoingCount)}`}
              title="They stand with"
            >
              <span className={cn('font-bold tabular-nums text-[var(--portal-blue)]', outgoingCount === 0 && 'opacity-40')}>
                {formatCount(outgoingCount)}
              </span>
              <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]" />
            </button>
          </div>
        </div>

        <div>
          <div className={columnLabel}>Solidarity</div>
          <div className="mt-1 flex items-center whitespace-nowrap text-[12px]">
            <button
              type="button"
              onClick={() => onOpenStanceDetail('mutual')}
              className={cn(metricBtn, 'focus-visible:ring-[var(--portal-purple-border)]')}
              aria-label={`${formatCount(mutualCount)} solidarity connections`}
              title="Mutual standing"
            >
              <ProtocolMotionArrow direction="in" className="h-2 w-2 text-[var(--portal-purple)]" />
              <span className={cn('font-bold tabular-nums text-[var(--portal-purple)]', mutualCount === 0 && 'opacity-40')}>
                {formatCount(mutualCount)}
              </span>
              <ProtocolMotionArrow className="h-2 w-2 text-[var(--portal-purple)]" />
            </button>
          </div>
        </div>

        <div>
          <div className={columnLabel}>Endorsements</div>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12px]">
            <button
              type="button"
              onClick={() => onOpenEndorsements('received')}
              className={cn(metricBtn, 'focus-visible:ring-[var(--portal-gold-accent)]')}
              aria-label={`${formatCount(endorsementCount)} endorsements received`}
              title="Endorsements received"
            >
              <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-gold)]" />
              <span className={cn('font-bold tabular-nums text-[var(--portal-gold)]', endorsementCount === 0 && 'opacity-40')}>
                {formatCount(endorsementCount)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onOpenEndorsements('given')}
              className={cn(metricBtn, 'focus-visible:ring-[var(--portal-gold-accent)]')}
              aria-label={`Endorses ${formatCount(givenEndorsementCount)}`}
              title="Endorsements given"
            >
              <span className={cn('font-bold tabular-nums text-[var(--portal-gold)]', givenEndorsementCount === 0 && 'opacity-40')}>
                {formatCount(givenEndorsementCount)}
              </span>
              <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-gold)]" />
            </button>
          </div>
        </div>
      </div>

      {previewAccounts.length > 0 ? (
        <button
          type="button"
          onClick={onOpenNetwork}
          className="group mt-3 inline-flex flex-col items-start rounded-md py-0.5 pr-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60"
          aria-label={isSelf ? 'View your standing network' : 'View standing network'}
          title="Open network"
        >
          <div className="flex items-center">
            {previewAccounts.map((account, index) => (
              <AccountAvatar
                key={account.accountId}
                avatarUrl={account.avatarUrl}
                className={cn(
                  'h-5 w-5 border-background',
                  index > 0 && '-ml-1.5'
                )}
              />
            ))}
            {overflowCount > 0 ? (
              <span className="pl-1 text-[9px] font-medium tabular-nums text-muted-foreground/45 transition-colors group-hover:text-muted-foreground/70">
                +{formatCount(overflowCount)}
              </span>
            ) : null}
          </div>
          <div className={cn(columnLabel, 'mt-1 transition-colors group-hover:text-muted-foreground/65')}>
            Network
          </div>
        </button>
      ) : null}

    </div>
  );
}

function ProfileSignalsCard({ reputation }: { reputation: ReputationEntry }) {
  const rank = toFiniteNumber(reputation.rank);
  const tier = reputationTier(rank > 0 ? rank : 999);
  const lockMonths = toFiniteNumber(reputation.lockMonths);
  const boosted = toFiniteNumber(reputation.boost) > 0;
  const earnedRewards = toFiniteNumber(reputation.rewardsEarned) > 0;
  const scarceActivity =
    toFiniteNumber(reputation.scarcesCreated) +
    toFiniteNumber(reputation.scarcesSold);
  const postActivity =
    toFiniteNumber(reputation.totalPosts) +
    toFiniteNumber(reputation.replyCount);
  const signalBadges = [
    boosted ? 'Boost participant' : null,
    earnedRewards ? 'SOCIAL earner' : null,
    scarceActivity > 0 ? 'Scarce creator' : null,
    postActivity > 0 ? 'Active contributor' : null,
  ].filter(Boolean) as string[];

  const dimensions = [
    { label: 'Social', value: toFiniteNumber(reputation.socialScore) },
    { label: 'Quality', value: toFiniteNumber(reputation.qualityScore) },
    {
      label: 'Consistency',
      value: toFiniteNumber(reputation.consistencyScore),
    },
    { label: 'Commitment', value: toFiniteNumber(reputation.commitmentScore) },
  ];
  const maxDimension = Math.max(
    1,
    ...dimensions.map((dimension) =>
      Number.isFinite(dimension.value) ? dimension.value : 0
    )
  );
  const profileSignalLabel =
    lockMonths >= 1 ? commitmentLabel(lockMonths) : 'Early signal';

  return (
    <div className="mt-4">
      <div className="h-px divider-section" />

      <div className="pt-3.5 pb-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[21px] font-semibold tabular-nums tracking-[-0.025em] text-foreground">
              {formatReputation(reputation.reputation)}
            </span>

            <span
              className={cn(
                'rounded-full border px-2 py-px text-[10px] font-medium',
                tier.accent === 'amber'
                  ? 'portal-amber-badge text-[var(--portal-amber)]'
                  : tier.accent === 'purple'
                    ? 'portal-purple-badge text-[var(--portal-purple)]'
                    : tier.accent === 'blue'
                      ? 'portal-blue-badge text-[var(--portal-blue)]'
                      : tier.accent === 'green'
                        ? 'portal-green-badge text-[var(--portal-green)]'
                        : 'portal-slate-badge text-[var(--portal-slate)]'
              )}
            >
              {tier.label}
            </span>

            {Number.isFinite(rank) && rank > 0 && (
              <span className="text-[10px] text-muted-foreground/65 tabular-nums">
                #{formatCount(rank)}
              </span>
            )}
          </div>

          <span className="shrink-0 rounded-full border portal-blue-badge px-2 py-px text-[10px] font-medium text-[var(--portal-blue)]">
            {profileSignalLabel}
          </span>
        </div>

        {/* Elegant single-line social proof */}
        <div className="mt-1.5 text-[12px] text-muted-foreground/70">
          {formatCount(toFiniteNumber(reputation.totalPosts))} posts ·{' '}
          {formatCount(toFiniteNumber(reputation.reactionsReceived))} reactions
          · {formatCount(toFiniteNumber(reputation.activeDays))} active days ·{' '}
          {formatNumericCompact(reputation.rewardsEarned)} SOCIAL earned
        </div>

        {/* Reputation personality mix — refined and human */}
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50 mb-1.5">
            Reputation mix
          </div>

          <div className="space-y-1">
            {dimensions.map((dimension) => {
              const value = Number.isFinite(dimension.value)
                ? dimension.value
                : 0;
              const width =
                value > 0 ? Math.max(10, (value / maxDimension) * 100) : 0;

              return (
                <div
                  key={dimension.label}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <span className="w-16 shrink-0 text-muted-foreground/70">
                    {dimension.label}
                  </span>

                  <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--portal-blue)]/75 transition-all"
                      style={{ width: `${width}%` }}
                    />
                  </div>

                  <span className="w-7 text-right tabular-nums text-muted-foreground/60">
                    {formatScore(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recognized for — elegant and minimal */}
        {signalBadges.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50 mb-1">
              Recognized for
            </div>
            <div className="flex flex-wrap gap-1">
              {signalBadges.slice(0, 3).map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-border/30 bg-background/50 px-2 py-px text-[10px] text-muted-foreground/80"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StanceDetailModal({
  open,
  kind,
  title,
  isSelf,
  social,
  mutualIds,
  viewerAccountId,
  onClose,
  onSelectAccount,
  onDiscoverProfiles,
  onUpdateAccountStanding,
}: {
  open: boolean;
  kind: StanceDetailKind;
  title: string;
  isSelf: boolean;
  social: ProfileSocialResponse;
  mutualIds: Set<string>;
  viewerAccountId: string | null;
  onClose: () => void;
  onSelectAccount?: (accountId: string) => void;
  onDiscoverProfiles?: () => void;
  onUpdateAccountStanding?: (
    account: StandingAccountSummary,
    shouldStand: boolean
  ) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  useBodyScrollLock(open, scrollRef);

  const mutualAccountsList = useMemo(() => {
    const outgoingSet = new Set(social.outgoing.map((a) => a.accountId));
    return social.incoming.filter((a) => outgoingSet.has(a.accountId));
  }, [social]);

  const accounts: StandingAccountSummary[] =
    kind === 'incoming'
      ? social.incoming
      : kind === 'outgoing'
        ? social.outgoing
        : mutualAccountsList;

  useEffect(() => {
    if (open) setQuery('');
  }, [kind, open]);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return accounts;

    return accounts.filter((account: StandingAccountSummary) => {
      const label = accountLabel(account).toLowerCase();
      const accountId = account.accountId.toLowerCase();
      return (
        label.includes(normalizedQuery) || accountId.includes(normalizedQuery)
      );
    });
  }, [accounts, query]);

  const accountCountLabel = formatCount(accounts.length);
  const standingVerb = accounts.length === 1 ? 'STANDS' : 'STAND';
  const modalMeta =
    kind === 'mutual'
      ? `${accountCountLabel} IN SOLIDARITY`
      : kind === 'incoming'
        ? isSelf
          ? `${accountCountLabel} ${standingVerb} WITH YOU`
          : `${accountCountLabel} ${standingVerb} WITH THEM`
        : isSelf
          ? `YOU STAND WITH ${accountCountLabel}`
          : `THEY STAND WITH ${accountCountLabel}`;
  const modalCloseLabel = `Close ${title} standing details`;

  const emptyLabel =
    kind === 'mutual'
      ? 'No solidarity yet.'
      : kind === 'incoming'
        ? isSelf
          ? 'No one stands with you yet.'
          : `No one stands with ${title} yet.`
        : isSelf
          ? 'You do not stand with anyone yet.'
          : `${title} does not stand with anyone yet.`;

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.16)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483646] flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label={modalCloseLabel}
            onClick={onClose}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 14,
              scale: 0.98,
              duration: 0.2,
              exitY: 8,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stance-detail-title"
            className={cn(
              'relative flex h-[min(620px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
              portalElevatedShadowClass
            )}
          >
            <ModalHeader
              titleId="stance-detail-title"
              title={title}
              description={modalMeta}
              descriptionVariant="meta"
              actions={
                <ModalCloseButton
                  ariaLabel={modalCloseLabel}
                  onClick={onClose}
                />
              }
            />

            {accounts.length > 0 ? (
              <div className="shrink-0 px-4 pb-4 md:px-5">
                <SearchInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search profiles"
                  size="lg"
                  maxLength={80}
                  clearAriaLabel="Clear profile search"
                />
              </div>
            ) : null}

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-5"
            >
              <StandingList
                accounts={filteredAccounts}
                mutualIds={mutualIds}
                emptyLabel={query.trim() ? 'No matching profiles.' : emptyLabel}
                emptyCta={
                  !query.trim() && kind === 'outgoing' && onDiscoverProfiles ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onDiscoverProfiles();
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue-hover)]"
                    >
                      Find someone to stand with
                    </button>
                  ) : undefined
                }
                onSelectAccount={(accountId) => {
                  onClose();
                  onSelectAccount?.(accountId);
                }}
                viewerAccountId={viewerAccountId}
                pendingAccountId={pendingAccountId}
                onUpdateStanding={async (account, shouldStand) => {
                  if (!onUpdateAccountStanding || pendingAccountId) return;
                  setPendingAccountId(account.accountId);
                  try {
                    await onUpdateAccountStanding(account, shouldStand);
                  } catch {
                    // The parent surfaces the transaction error in the profile modal.
                  } finally {
                    setPendingAccountId(null);
                  }
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function StandingList({
  accounts,
  mutualIds,
  emptyLabel,
  emptyCta,
  viewerAccountId,
  pendingAccountId,
  onSelectAccount,
  onUpdateStanding,
}: {
  accounts: StandingAccountSummary[];
  mutualIds: Set<string>;
  emptyLabel: string;
  emptyCta?: ReactNode;
  viewerAccountId: string | null;
  pendingAccountId?: string | null;
  onSelectAccount?: (accountId: string) => void;
  onUpdateStanding?: (
    account: StandingAccountSummary,
    shouldStand: boolean
  ) => Promise<void>;
}) {
  if (accounts.length === 0) {
    return <EmptyState cta={emptyCta}>{emptyLabel}</EmptyState>;
  }

  return (
    <div className="divide-y divide-fade-item">
      {accounts.map((account) => {
        const isMutual = mutualIds.has(account.accountId);
        const canUpdateStanding =
          Boolean(viewerAccountId) &&
          viewerAccountId !== account.accountId &&
          Boolean(onUpdateStanding);
        const isRowPending = pendingAccountId === account.accountId;
        const viewerStandsWithAccount = Boolean(account.viewerStanding);
        return (
          <div
            key={account.accountId}
            className="flex w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--portal-slate-bg)] focus-within:bg-[var(--portal-slate-bg)]"
          >
            <button
              type="button"
              onClick={() => onSelectAccount?.(account.accountId)}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none"
            >
              <AccountAvatar
                avatarUrl={account.avatarUrl}
                className="h-9 w-9"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {accountLabel(account)}
                  </span>
                  {isMutual ? (
                    <span
                      className="shrink-0 inline-flex h-4 items-center rounded-full border border-[var(--portal-purple-frame-border)] bg-[var(--portal-purple-bg)] px-1.5 text-[9px] font-medium uppercase tracking-wider text-[var(--portal-purple)]"
                      title="Solidarity"
                    >
                      Solidarity
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground/55">
                  {account.accountId}
                </span>
              </span>
            </button>

            {canUpdateStanding ? (
              isRowPending ? (
                <span
                  className={cn(
                    profileActionButtonClass(
                      viewerStandsWithAccount ? 'slate' : 'blue'
                    )
                  )}
                  aria-label={
                    viewerStandsWithAccount ? 'Stepping back' : 'Standing'
                  }
                >
                  <PulsingDots size="sm" />
                </span>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(pendingAccountId)}
                  onClick={() =>
                    onUpdateStanding?.(account, !viewerStandsWithAccount)
                  }
                  className={cn(
                    profileActionButtonClass(
                      viewerStandsWithAccount ? 'slate' : 'blue'
                    )
                  )}
                  aria-label={
                    viewerStandsWithAccount
                      ? `Step back from ${accountLabel(account)}`
                      : `Stand with ${accountLabel(account)}`
                  }
                >
                  {viewerStandsWithAccount ? 'Step back' : 'Stand'}
                </button>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ProfileModal({
  open,
  accountId,
  viewerAccountId,
  selfProfile,
  selfAvatarUrl,
  hasSocialSession = false,
  isUpdatingStanding = false,
  onOpenChange,
  onEditProfile,
  onSelectAccount,
  onDiscoverProfiles,
  onUpdateStanding,
  onEndorse,
  onRemoveEndorsement,
}: ProfileModalProps) {
  const reduceMotion = useReducedMotion();
  const [profile, setProfile] = useState<MaterialisedProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [social, setSocial] = useState<ProfileSocialResponse | null>(null);
  const [profileSignals, setProfileSignals] =
    useState<ProfileSignalsResponse | null>(null);
  const [hasProfileLoaded, setHasProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingStandingAction, setPendingStandingAction] = useState<
    'stand' | 'step-back' | null
  >(null);
  const [endorsementCount, setEndorsementCount] = useState(0);
  const [givenEndorsementCount, setGivenEndorsementCount] = useState(0);
  const [endorsementsModalIntent, setEndorsementsModalIntent] =
    useState<EndorsementsModalIntent | null>(null);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [stanceDetail, setStanceDetail] = useState<StanceDetailKind | null>(
    null
  );
  const latestSocialLoadRef = useRef(0);
  const latestSignalsLoadRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSelf = Boolean(accountId && viewerAccountId === accountId);
  useBodyScrollLock(open && Boolean(accountId), scrollRef);
  const title = displayName(profile, accountId);
  const bio = profile?.bio?.trim();
  const canStand = Boolean(accountId && viewerAccountId && !isSelf);
  const viewerStanding = Boolean(social?.viewerStanding);
  const socialReady = Boolean(social || socialError);
  const mutualIds = useMemo(() => {
    if (!social) return new Set<string>();
    const outgoingIds = new Set(
      social.outgoing.map((account) => account.accountId)
    );
    return new Set(
      social.incoming
        .filter((account) => outgoingIds.has(account.accountId))
        .map((account) => account.accountId)
    );
  }, [social]);

  const networkAccounts: NetworkAccount[] = useMemo(() => {
    if (!social) return [];
    const outgoingIds = new Set(
      social.outgoing.map((account) => account.accountId)
    );
    const seen = new Set<string>();
    const result: NetworkAccount[] = [];

    for (const account of social.incoming) {
      if (!outgoingIds.has(account.accountId)) continue;
      if (seen.has(account.accountId)) continue;
      seen.add(account.accountId);
      result.push({
        accountId: account.accountId,
        name: account.name,
        avatarUrl: account.avatarUrl,
        kind: 'mutual',
      });
    }
    for (const account of social.incoming) {
      if (seen.has(account.accountId)) continue;
      seen.add(account.accountId);
      result.push({
        accountId: account.accountId,
        name: account.name,
        avatarUrl: account.avatarUrl,
        kind: 'incoming',
      });
    }
    for (const account of social.outgoing) {
      if (seen.has(account.accountId)) continue;
      seen.add(account.accountId);
      result.push({
        accountId: account.accountId,
        name: account.name,
        avatarUrl: account.avatarUrl,
        kind: 'outgoing',
      });
    }
    return result;
  }, [social]);

  const refreshSocial = useCallback(async () => {
    if (!accountId) return;
    const loadId = latestSocialLoadRef.current + 1;
    latestSocialLoadRef.current = loadId;
    setSocialError(null);

    try {
      const result = await fetchProfileSocial(accountId, viewerAccountId);
      if (latestSocialLoadRef.current !== loadId) return;
      setSocial(result);
    } catch (error) {
      if (latestSocialLoadRef.current !== loadId) return;
      setSocialError(getErrorMessage(error));
    }
  }, [accountId, viewerAccountId]);

  const refreshProfileSignals = useCallback(async () => {
    if (!accountId) return;
    const loadId = latestSignalsLoadRef.current + 1;
    latestSignalsLoadRef.current = loadId;

    try {
      const result = await fetchProfileSignals(accountId);
      if (latestSignalsLoadRef.current !== loadId) return;
      setProfileSignals(result);
    } catch {
      if (latestSignalsLoadRef.current !== loadId) return;
      setProfileSignals(null);
    }
  }, [accountId]);

  useEffect(() => {
    if (!open || !accountId) {
      latestSocialLoadRef.current += 1;
      latestSignalsLoadRef.current += 1;
      setStanceDetail(null);
      return;
    }

    setStanceDetail(null);
    setSocial(null);
    setProfileSignals(null);
    setSocialError(null);
    setEndorsementCount(0);
    setGivenEndorsementCount(0);
    setEndorsementsModalIntent(null);
    setNetworkOpen(false);
  }, [accountId, open]);

  useEffect(() => {
    if (!open || !accountId) return;

    let cancelled = false;
    setActionError(null);

    if (isSelf && selfProfile) {
      setProfile(selfProfile);
      setAvatarUrl(selfAvatarUrl);
      setHasProfileLoaded(true);
    } else {
      setProfile(null);
      setAvatarUrl(null);
      setHasProfileLoaded(false);
    }

    setProfileError(null);

    void fetchPortalProfile(accountId)
      .then((result) => {
        if (cancelled) return;
        setProfile(result.profile);
        setAvatarUrl(result.avatarUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        setProfileError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setHasProfileLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, isSelf, open, selfAvatarUrl, selfProfile]);

  useEffect(() => {
    if (!open || !accountId) return;
    void refreshSocial();
    void refreshProfileSignals();
  }, [accountId, open, refreshProfileSignals, refreshSocial]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isUpdatingStanding) {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUpdatingStanding, onOpenChange, open]);

  const handleAccountStanding = async (
    account: StandingAccountSummary,
    shouldStand: boolean
  ) => {
    if (!viewerAccountId || account.accountId === viewerAccountId) return;

    const accountSummary: StandingAccountSummary = {
      ...account,
      viewerStanding: shouldStand,
    };

    setActionError(null);

    try {
      await onUpdateStanding(account.accountId, shouldStand);
      setSocial((current) => {
        if (!current) return current;

        const applyViewerStanding = (accounts: StandingAccountSummary[]) =>
          accounts.map((item) =>
            item.accountId === account.accountId
              ? { ...item, viewerStanding: shouldStand }
              : item
          );

        let incoming = applyViewerStanding(current.incoming);
        let outgoing = applyViewerStanding(current.outgoing);
        let outgoingCount = current.counts.outgoing;

        if (isSelf) {
          const hasOutgoing = current.outgoing.some(
            (item) => item.accountId === account.accountId
          );

          if (shouldStand && !hasOutgoing) {
            outgoing = [
              accountSummary,
              ...outgoing.filter(
                (item) => item.accountId !== account.accountId
              ),
            ];
            outgoingCount += 1;
          } else if (!shouldStand && hasOutgoing) {
            outgoing = outgoing.filter(
              (item) => item.accountId !== account.accountId
            );
            outgoingCount = Math.max(0, outgoingCount - 1);
          }
        }

        return {
          ...current,
          counts: {
            ...current.counts,
            outgoing: outgoingCount,
          },
          incoming,
          outgoing,
        };
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
      throw error;
    }
  };

  const handleStanding = async () => {
    if (!accountId || !viewerAccountId || !canStand || isUpdatingStanding) {
      return;
    }

    const nextStanding = !viewerStanding;
    const viewerSummary: StandingAccountSummary = {
      accountId: viewerAccountId,
      name: selfProfile?.name?.trim() || null,
      avatarUrl: selfAvatarUrl,
    };
    const applyViewerStanding = (
      current: ProfileSocialResponse,
      standing: boolean
    ): ProfileSocialResponse => {
      const incoming = standing
        ? [
            viewerSummary,
            ...current.incoming.filter(
              (account) => account.accountId !== viewerAccountId
            ),
          ]
        : current.incoming.filter(
            (account) => account.accountId !== viewerAccountId
          );
      const incomingDelta =
        standing === current.viewerStanding ? 0 : standing ? 1 : -1;

      return {
        ...current,
        viewerStanding: standing,
        counts: {
          ...current.counts,
          incoming: Math.max(0, current.counts.incoming + incomingDelta),
        },
        incoming,
      };
    };

    setActionError(null);
    setPendingStandingAction(nextStanding ? 'stand' : 'step-back');

    try {
      await onUpdateStanding(accountId, nextStanding);
      setSocial((current) => {
        if (!current) return current;
        return applyViewerStanding(current, nextStanding);
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setPendingStandingAction(null);
    }
  };

  const openEndorsementsModal = useCallback(
    (mode: EndorsementsModalIntent['mode'], topic?: string) => {
      setEndorsementsModalIntent((current) => ({
        mode,
        topic: topic ?? null,
        nonce: (current?.nonce ?? 0) + 1,
      }));
    },
    []
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open && accountId ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483645] flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label="Close profile"
            disabled={isUpdatingStanding}
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 16,
              scale: 0.98,
              duration: 0.22,
              exitY: 10,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
            className={cn(
              'relative flex h-[min(760px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
              portalElevatedShadowClass
            )}
          >
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
                {isSelf && hasProfileLoaded ? (
                  <button
                    type="button"
                    onClick={onEditProfile}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/45 bg-background/60 px-3 text-[13px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:border-border hover:text-foreground"
                    aria-label="Edit profile"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    Edit
                  </button>
                ) : null}
                <ModalCloseButton
                  ariaLabel="Close profile"
                  onClick={() => onOpenChange(false)}
                  disabled={isUpdatingStanding}
                />
              </div>

              {!hasProfileLoaded ? (
                <>
                  <h2 id="profile-modal-title" className="sr-only">
                    Profile
                  </h2>
                  <ProfileIdentityLoading />
                </>
              ) : (
                <>
                  <div className="relative h-24 shrink-0 overflow-hidden">
                    <div
                      className="absolute inset-0"
                      style={{
                        background: accountGradient(accountId),
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[hsl(var(--background)/0.98)] to-transparent" />
                  </div>

                  <div className="relative -mt-10 space-y-3 px-4 pb-5 md:px-5">
                    <div className="flex items-end gap-3.5">
                      <AccountAvatar
                        avatarUrl={avatarUrl}
                        className="h-[68px] w-[68px] rounded-2xl ring-[3px] ring-background shadow-lg"
                      />
                      <div className="min-w-0 flex-1 pb-0.5 pr-8">
                        <h2
                          id="profile-modal-title"
                          className="min-w-0 truncate text-lg font-semibold text-foreground"
                        >
                          {title}
                        </h2>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground/55">
                          {accountId}
                        </p>
                      </div>
                    </div>

                    {bio ? (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {bio}
                      </p>
                    ) : null}

                    {canStand ? (
                      <div className="flex items-center gap-2">
                        {pendingStandingAction ? (
                          <div
                            className={cn(
                              profileActionButtonClass(
                                pendingStandingAction === 'stand'
                                  ? 'blue'
                                  : 'slate'
                              )
                            )}
                            aria-live="polite"
                            aria-label={
                              viewerStanding
                                ? 'Stepping back'
                                : 'Confirming stance'
                            }
                          >
                            <PulsingDots size="sm" />
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              profileActionButtonClass(
                                viewerStanding ? 'slate' : 'blue'
                              )
                            )}
                            disabled={!canStand || isUpdatingStanding}
                            onClick={handleStanding}
                            aria-label={
                              viewerStanding
                                ? `Step back from ${title}`
                                : `Stand with ${title}`
                            }
                            title={
                              viewerStanding
                                ? `Step back from ${title}`
                                : `Stand with ${title}`
                            }
                          >
                            {viewerStanding
                              ? 'Step back'
                              : hasSocialSession
                                ? 'Stand with'
                                : 'Authorize & stand'}
                          </Button>
                        )}
                      </div>
                    ) : null}

                    {!socialReady ? (
                      <div className="space-y-2">
                        <div className="flex items-start gap-6">
                          <div className="space-y-1.5">
                            <Skeleton className="h-2 w-14" />
                            <div className="flex gap-1.5">
                              <Skeleton className="h-4 w-8 rounded" />
                              <Skeleton className="h-4 w-8 rounded" />
                              <Skeleton className="h-4 w-6 rounded" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Skeleton className="h-2 w-20" />
                            <div className="flex gap-1.5">
                              <Skeleton className="h-4 w-8 rounded" />
                              <Skeleton className="h-4 w-8 rounded" />
                            </div>
                          </div>
                        </div>
                        <div className="flex -space-x-1">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton
                              key={i}
                              className="h-5 w-5 rounded-full"
                            />
                          ))}
                        </div>
                      </div>
                    ) : social ? (
                      <SocialProofStrip
                        social={social}
                        endorsementCount={endorsementCount}
                        givenEndorsementCount={givenEndorsementCount}
                        isSelf={isSelf}
                        onOpenStanceDetail={setStanceDetail}
                        onOpenNetwork={() => setNetworkOpen(true)}
                        onOpenEndorsements={openEndorsementsModal}
                      />
                    ) : null}

                    {profileSignals?.reputation ? (
                      <ProfileSignalsCard
                        reputation={profileSignals.reputation}
                      />
                    ) : null}

                    <ProfileEndorsements
                      accountId={accountId}
                      viewerAccountId={viewerAccountId}
                      targetDisplayName={title}
                      targetAvatarUrl={avatarUrl}
                      hasSocialSession={hasSocialSession}
                      onEndorse={onEndorse}
                      onRemoveEndorsement={onRemoveEndorsement}
                      onSelectAccount={onSelectAccount}
                      onEndorsementCountChange={setEndorsementCount}
                      onGivenCountChange={setGivenEndorsementCount}
                      endorsementsModalIntent={endorsementsModalIntent}
                    />
                  </div>
                </>
              )}

              {profileError || socialError || actionError ? (
                <p className="mx-4 mt-4 mb-5 rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)] md:mx-5">
                  {actionError ?? profileError ?? socialError}
                </p>
              ) : null}
            </div>
          </motion.div>
          {social ? (
            <StanceDetailModal
              open={stanceDetail !== null}
              kind={stanceDetail ?? 'incoming'}
              title={title}
              isSelf={isSelf}
              social={social}
              mutualIds={mutualIds}
              viewerAccountId={viewerAccountId}
              onClose={() => setStanceDetail(null)}
              onSelectAccount={onSelectAccount}
              onDiscoverProfiles={onDiscoverProfiles}
              onUpdateAccountStanding={handleAccountStanding}
            />
          ) : null}
          <NetworkModal
            open={networkOpen}
            centerAccountId={accountId}
            centerAvatarUrl={avatarUrl}
            centerDisplayName={title}
            accounts={networkAccounts}
            isSelf={isSelf}
            onClose={() => setNetworkOpen(false)}
            onSelectAccount={(id) => {
              setNetworkOpen(false);
              onSelectAccount?.(id);
            }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
