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
import { PenLine, User, UserMinus, UserPlus, X } from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { Button } from '@/components/ui/button';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
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
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(count);
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Skeleton className="h-20 w-20 shrink-0 rounded-2xl border border-border/35 bg-foreground/[0.08] sm:h-24 sm:w-24" />
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44 max-w-full bg-foreground/10" />
          <Skeleton className="h-3 w-56 max-w-full bg-foreground/[0.06]" />
        </div>
        <SkeletonText
          lines={2}
          className="max-w-md"
          widths={['w-full', 'w-3/5']}
        />
        <Skeleton className="h-8 w-32 rounded-full bg-foreground/[0.07]" />
      </div>
    </div>
  );
}

function SocialGraphLoading() {
  return (
    <div className="mt-2 flex items-center gap-3 sm:gap-5">
      <div className="flex items-center gap-1.5 px-1.5">
        <Skeleton className="h-3 w-4 bg-foreground/[0.08]" />
        <Skeleton className="h-3 w-20 bg-foreground/[0.07]" />
      </div>
      <div className="flex items-center gap-1.5 px-1.5">
        <Skeleton className="h-3 w-16 bg-foreground/[0.07]" />
        <Skeleton className="h-3 w-4 bg-foreground/[0.08]" />
      </div>
    </div>
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

function AvatarPreviewStack({
  accounts,
  compact = false,
}: {
  accounts: StandingAccountSummary[];
  compact?: boolean;
}) {
  const previewAccounts = accounts.slice(0, 3);
  const overflowCount = accounts.length - previewAccounts.length;

  const avatarSize = compact ? 'h-4 w-4' : 'h-6 w-6';
  const overlap = compact ? '-ml-1' : '-ml-2';
  const badgeSize = compact
    ? 'h-4 min-w-4 text-[9px] px-0.5'
    : 'h-6 min-w-6 text-[10px] px-1.5';

  if (accounts.length === 0) return null;

  return (
    <span className="flex items-center">
      {previewAccounts.map((account, index) => (
        <AccountAvatar
          key={account.accountId}
          avatarUrl={account.avatarUrl}
          className={cn(
            avatarSize,
            'border-background',
            index > 0 && overlap
          )}
        />
      ))}
      {overflowCount > 0 ? (
        <span
          className={cn(
            '-ml-1 inline-flex items-center justify-center rounded-full border border-background bg-muted font-medium text-muted-foreground',
            badgeSize
          )}
        >
          +{formatCount(overflowCount)}
        </span>
      ) : null}
    </span>
  );
}

function StanceGraphSummary({
  isSelf,
  social,
  onOpenDetail,
}: {
  isSelf: boolean;
  social: ProfileSocialResponse;
  onOpenDetail: (kind: StanceDetailKind) => void;
}) {
  const incomingCount = social.counts.incoming;
  const outgoingCount = social.counts.outgoing;
  const incomingLabel = isSelf ? 'Stand with you' : 'Stand with them';
  const outgoingLabel = isSelf ? 'You stand with' : 'They stand with';

  const mutualAccounts = useMemo(() => {
    const outgoingSet = new Set(social.outgoing.map((a) => a.accountId));
    return social.incoming.filter((a) => outgoingSet.has(a.accountId));
  }, [social]);

  return (
    <div className="mt-2 flex flex-wrap items-start gap-2">
      <button
        type="button"
        onClick={() => onOpenDetail('incoming')}
        className="group rounded-lg py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-blue-focus-border)]"
      >
        <span className="flex items-baseline gap-1 rounded-full border portal-blue-badge px-2.5 py-1 text-[13px] transition-[background-color,border-color,box-shadow] group-hover:border-[var(--portal-blue-border-strong)] group-hover:bg-[var(--portal-blue-frame-bg)] group-hover:shadow-[0_4px_6px_-1px_var(--portal-blue-shadow),0_2px_4px_-2px_var(--portal-blue-shadow)]">
          <span className={cn(
            'font-semibold tabular-nums',
            incomingCount === 0 ? 'text-muted-foreground/50' : 'text-current'
          )}>
            {formatCount(incomingCount)}
          </span>
          <span className="text-muted-foreground/70">{incomingLabel}</span>
        </span>
        {social.incoming.length > 0 ? (
          <div className="mt-0.5 px-1.5">
            <AvatarPreviewStack accounts={social.incoming} compact />
          </div>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => onOpenDetail('outgoing')}
        className="group rounded-lg py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-blue-focus-border)]"
      >
        <span className="flex items-baseline gap-1 rounded-full border portal-blue-badge px-2.5 py-1 text-[13px] transition-[background-color,border-color,box-shadow] group-hover:border-[var(--portal-blue-border-strong)] group-hover:bg-[var(--portal-blue-frame-bg)] group-hover:shadow-[0_4px_6px_-1px_var(--portal-blue-shadow),0_2px_4px_-2px_var(--portal-blue-shadow)]">
          <span className="text-muted-foreground/70">{outgoingLabel}</span>
          <span className={cn(
            'font-semibold tabular-nums',
            outgoingCount === 0 ? 'text-muted-foreground/50' : 'text-current'
          )}>
            {formatCount(outgoingCount)}
          </span>
        </span>
        {social.outgoing.length > 0 ? (
          <div className="mt-0.5 px-1.5">
            <AvatarPreviewStack accounts={social.outgoing} compact />
          </div>
        ) : null}
      </button>

      {mutualAccounts.length > 0 ? (
        <button
          type="button"
          onClick={() => onOpenDetail('mutual')}
          className="group rounded-lg py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-purple-border)] sm:ml-1"
        >
          <span className="flex items-baseline gap-1 rounded-full border portal-purple-badge px-2.5 py-1 text-[13px] transition-[background-color,border-color,box-shadow] group-hover:border-[var(--portal-purple-border-strong)] group-hover:bg-[var(--portal-purple-frame-bg)] group-hover:shadow-[0_4px_6px_-1px_var(--portal-purple-shadow),0_2px_4px_-2px_var(--portal-purple-shadow)]">
            <span className="text-muted-foreground/70">Together</span>
            <span className="font-semibold tabular-nums text-current">
              {formatCount(mutualAccounts.length)}
            </span>
          </span>
          <div className="mt-0.5 px-1.5">
            <AvatarPreviewStack accounts={mutualAccounts} compact />
          </div>
        </button>
      ) : null}
    </div>
  );
}

function ProfileSignalsCard({ reputation }: { reputation: ReputationEntry }) {
  const rank = toFiniteNumber(reputation.rank);
  const tier = reputationTier(rank > 0 ? rank : 999);
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

  return (
    <section className="mt-3 rounded-2xl border border-border/45 bg-muted/14 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/55">
            Protocol signals
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-lg font-semibold tabular-nums tracking-[-0.02em] text-foreground">
              {formatReputation(reputation.reputation)}
            </span>
            <span className="rounded-full border portal-purple-badge px-2 py-0.5 text-[10px] font-medium text-[var(--portal-purple)]">
              {tier.label}
            </span>
            {Number.isFinite(rank) && rank > 0 ? (
              <span className="text-[11px] text-muted-foreground/60">
                Rank #{formatCount(rank)}
              </span>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border/45 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {commitmentLabel(toFiniteNumber(reputation.lockMonths))}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
        {[
          ['Posts', formatCount(toFiniteNumber(reputation.totalPosts))],
          [
            'Reactions',
            formatCount(toFiniteNumber(reputation.reactionsReceived)),
          ],
          ['Active days', formatCount(toFiniteNumber(reputation.activeDays))],
          ['SOCIAL earned', formatNumericCompact(reputation.rewardsEarned)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-border/35 bg-background/38 px-2 py-1.5"
          >
            <p className="font-medium tabular-nums text-foreground">{value}</p>
            <p className="text-muted-foreground/60">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {dimensions.map((dimension) => {
          const value = Number.isFinite(dimension.value) ? dimension.value : 0;
          const width =
            value > 0 ? Math.max(8, (value / maxDimension) * 100) : 0;
          return (
            <div
              key={dimension.label}
              className="grid grid-cols-[74px_1fr_32px] items-center gap-2 text-[10px]"
            >
              <span className="text-muted-foreground/60">
                {dimension.label}
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                <span
                  className="block h-full rounded-full bg-[var(--portal-blue)]"
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="text-right tabular-nums text-muted-foreground/65">
                {formatScore(value)}
              </span>
            </div>
          );
        })}
      </div>

      {signalBadges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {signalBadges.slice(0, 3).map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-border/35 bg-background/38 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}
    </section>
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

  const modalTitle =
    kind === 'mutual'
      ? isSelf
        ? 'Together'
        : `Together with ${title}`
      : kind === 'incoming'
        ? isSelf
          ? 'Who stands with you'
          : `Who stands with ${title}`
        : isSelf
          ? 'Who you stand with'
          : `Who ${title} stands with`;

  const emptyLabel =
    kind === 'mutual'
      ? 'No shared connections yet.'
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
            aria-label={`Close ${modalTitle}`}
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
            <div className="shrink-0 space-y-4 px-4 py-5 md:px-5">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                aria-label={`Close ${modalTitle}`}
              >
                <X className="h-4 w-4" />
              </button>
              <div className="min-w-0 pr-10">
                <h2
                  id="stance-detail-title"
                  className="truncate text-xl font-semibold text-foreground"
                >
                  {modalTitle}
                </h2>
              </div>

              {accounts.length > 0 ? (
                <SearchInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search profiles"
                  size="lg"
                  maxLength={80}
                  clearAriaLabel="Clear profile search"
                />
              ) : null}
            </div>

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
    <div className="space-y-0.5">
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
            className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--portal-slate-bg)] hover:text-foreground"
          >
            <button
              type="button"
              onClick={() => onSelectAccount?.(account.accountId)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-blue-focus-border)]"
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
                      title="Together"
                    >
                      Together
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
                    'flex h-7 min-w-[80px] shrink-0 items-center justify-center rounded-full',
                    viewerStandsWithAccount
                      ? 'border border-border/50 bg-transparent text-muted-foreground'
                      : 'border portal-green-surface'
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
                    'inline-flex h-7 min-w-[80px] shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50',
                    viewerStandsWithAccount
                      ? 'border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground focus-visible:ring-border/50'
                      : 'portal-green-surface focus-visible:ring-[var(--portal-green-border)]'
                  )}
                  aria-label={
                    viewerStandsWithAccount
                      ? `Step back from ${accountLabel(account)}`
                      : `Stand with ${accountLabel(account)}`
                  }
                >
                  {viewerStandsWithAccount ? (
                    <>
                      <UserMinus className="h-3 w-3" />
                      Step back
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3 w-3" />
                      Stand
                    </>
                  )}
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
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-5"
            >
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
                {isSelf && hasProfileLoaded ? (
                  <button
                    type="button"
                    onClick={onEditProfile}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/45 px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                    aria-label="Edit profile"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    Edit
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={isUpdatingStanding}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Close profile"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!hasProfileLoaded ? (
                <>
                  <h2 id="profile-modal-title" className="sr-only">
                    Profile
                  </h2>
                  <ProfileIdentityLoading />
                </>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <AccountAvatar
                    avatarUrl={avatarUrl}
                    className="h-20 w-20 rounded-2xl sm:h-24 sm:w-24"
                  />

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="min-w-0 pr-8">
                      <h2
                        id="profile-modal-title"
                        className="min-w-0 truncate text-xl font-semibold text-foreground"
                      >
                        {title}
                      </h2>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground/60">
                        {accountId}
                      </p>
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
                              'flex h-8 min-w-[120px] items-center justify-center rounded-full',
                              pendingStandingAction === 'stand'
                                ? 'border portal-green-surface'
                                : 'border border-border/50 bg-transparent text-muted-foreground'
                            )}
                            aria-live="polite"
                            aria-label={viewerStanding ? 'Stepping back' : 'Confirming stance'}
                          >
                            <PulsingDots size="sm" />
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant={viewerStanding ? 'outline' : 'accent'}
                            className="h-8 px-3 md:h-8 md:px-3"
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
                            {viewerStanding ? (
                              <>
                                <UserMinus className="h-3.5 w-3.5" />
                                Step back
                              </>
                            ) : hasSocialSession ? (
                              <>
                                <UserPlus className="h-3.5 w-3.5" />
                                Stand with {title}
                              </>
                            ) : (
                              <>
                                <UserPlus className="h-3.5 w-3.5" />
                                Authorize &amp; stand
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    ) : null}

                    {!socialReady ? (
                      <SocialGraphLoading />
                    ) : social ? (
                      <StanceGraphSummary
                        isSelf={isSelf}
                        social={social}
                        onOpenDetail={setStanceDetail}
                      />
                    ) : null}

                    {profileSignals?.reputation ? (
                      <ProfileSignalsCard
                        reputation={profileSignals.reputation}
                      />
                    ) : null}
                  </div>
                </div>
              )}

              {profileError || socialError || actionError ? (
                <p className="mt-4 rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
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
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
