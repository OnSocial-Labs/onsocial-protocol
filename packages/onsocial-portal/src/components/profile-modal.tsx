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
import { Github, Globe, PenLine, Plus, User } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import type { MaterialisedProfile, EndorsementBuildInput } from '@onsocial/sdk';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { profileActionButtonClass } from '@/components/ui/profile-action-pill';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { RelationshipSignal } from '@/components/ui/relationship-signal';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { NetworkModal, type NetworkAccount } from '@/components/network-modal';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import {
  TransactionFeedbackToast,
  type TransactionFeedback,
} from '@/components/ui/transaction-feedback-toast';
import {
  ProfileEndorsements,
  type EndorsementsModalIntent,
} from '@/components/profile-endorsements';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import type { StandingUpdateResult } from '@/contexts/profile-context';
import {
  commitmentLabel,
  formatReputation,
  formatScore,
  reputationTier,
  type ReputationEntry,
} from '@/lib/leaderboard';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  buildProfileLinkUrl,
  normalizeWebsiteForDisplay,
  type ProfileSocialLinkKind,
} from '@/lib/profile-links';
import { cn } from '@/lib/utils';
import {
  reportWalletActionFailure,
  isWalletUserCancellation,
  isWalletCancellationMessage,
} from '@/lib/wallet-errors';

interface PortalProfileResponse {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  firstProfileTimestamp: number | null;
  latestProfileUpdateFields: string[];
  network?: 'testnet' | 'mainnet';
  nearAccount?: {
    codeHash: string;
    storageUsage: number;
  } | null;
  nearAccountExplorerUrl?: string;
  nearAccountCreation?: {
    blockTimestamp: number;
    transactionHash: string | null;
    explorerUrl: string | null;
  } | null;
}

interface StandingAccountSummary {
  accountId: string;
  name: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  standingSince?: number | null;
  standingBlockTimestamp?: number | null;
  standingCount?: number;
  standingWithCount?: number;
  mutualStandingCount?: number;
  endorsementsReceivedCount?: number;
  endorsementsGivenCount?: number;
  viewerStanding?: boolean;
  theyStandWithViewer?: boolean;
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
  selfBannerUrl: string | null;
  hasSocialSession?: boolean;
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
    bannerUrl: body?.bannerUrl ?? null,
    firstProfileTimestamp: body?.firstProfileTimestamp ?? null,
    latestProfileUpdateFields: body?.latestProfileUpdateFields ?? [],
    network: body?.network,
    nearAccount: body?.nearAccount ?? null,
    nearAccountExplorerUrl: body?.nearAccountExplorerUrl,
    nearAccountCreation: body?.nearAccountCreation ?? null,
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
      standingCount: Number(account.standingCount ?? 0),
      standingWithCount: Number(account.standingWithCount ?? 0),
      mutualStandingCount: Number(account.mutualStandingCount ?? 0),
      endorsementsReceivedCount: Number(account.endorsementsReceivedCount ?? 0),
      endorsementsGivenCount: Number(account.endorsementsGivenCount ?? 0),
      viewerStanding: Boolean(account.viewerStanding),
      theyStandWithViewer: Boolean(account.theyStandWithViewer),
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

function normalizeTimestamp(value?: number | null): number | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  if (value > 1_000_000_000_000_000) return Math.floor(value / 1_000_000);
  if (value < 1_000_000_000_000) return value * 1000;
  return value;
}

function profileSinceLabel(timestamp?: number | null): string | null {
  const normalized = normalizeTimestamp(timestamp);
  if (!normalized) return null;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(normalized));
}

function profileDateLabel(timestamp?: number | null): string | null {
  const normalized = normalizeTimestamp(timestamp);
  if (!normalized) return null;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(normalized));
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function profileLinkItems(links?: Record<string, string>) {
  if (!links) return [];

  const candidates: Array<{
    key: string;
    label: string;
    value?: string;
    kind: ProfileSocialLinkKind | 'website';
  }> = [
    {
      key: 'website',
      label: 'Website',
      value: links.website,
      kind: 'website',
    },
    { key: 'x', label: 'X', value: links.x ?? links.twitter, kind: 'x' },
    {
      key: 'telegram',
      label: 'Telegram',
      value: links.telegram,
      kind: 'telegram',
    },
    { key: 'github', label: 'GitHub', value: links.github, kind: 'github' },
  ];

  return candidates.flatMap((item) => {
    if (!item.value?.trim()) return [];

    try {
      const href = buildProfileLinkUrl(item.value, item.kind);
      const display =
        item.kind === 'website'
          ? normalizeWebsiteForDisplay(item.value)
          : item.value.replace(/^@/, '');

      return [
        {
          key: item.key,
          label: item.label,
          display,
          href,
          kind: item.kind,
        },
      ];
    } catch {
      return [];
    }
  });
}

function ProfileLinkIcon({
  kind,
  className,
}: {
  kind: ProfileSocialLinkKind | 'website';
  className?: string;
}) {
  if (kind === 'website') return <Globe className={className} />;
  if (kind === 'x') return <FaXTwitter className={className} />;
  if (kind === 'telegram') return <RiTelegram2Line className={className} />;
  return <Github className={className} />;
}

const NEAR_EMPTY_CODE_HASH = '11111111111111111111111111111111';

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

function normalizeSocialTimestamp(value?: number | null): number | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  if (value > 1_000_000_000_000_000) return Math.floor(value / 1_000_000);
  if (value < 1_000_000_000_000) return value * 1000;
  return value;
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const diff = Math.max(0, Date.now() - timestamp);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function standingTimeMeta(
  account: StandingAccountSummary
): { label: string; description: string } | null {
  const since = normalizeSocialTimestamp(account.standingSince);
  if (since) {
    const label = formatRelativeTime(since);
    return { label, description: `Standing since ${label}` };
  }
  const added = normalizeSocialTimestamp(account.standingBlockTimestamp);
  if (!added) return null;
  const label = formatRelativeTime(added);
  return { label, description: `Standing added ${label}` };
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
    <div className="px-3 py-5 text-center text-xs text-muted-foreground/65">
      {children}
      {cta ? <div className="mt-2">{cta}</div> : null}
    </div>
  );
}

function ProfileIdentityLoading() {
  return (
    <>
      <div className="aspect-[5/1] bg-foreground/[0.03]" />
      <div className="-mt-10 space-y-3 px-4 pb-5 md:px-5">
        <div className="flex items-end gap-3.5">
          <Skeleton className="h-20 w-20 md:h-24 md:w-24 shrink-0 rounded-2xl !border-[3px] !border-background" />
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
  placeholderIconClassName = 'h-4 w-4',
  placeholderIconStrokeWidth = 2,
}: {
  avatarUrl: string | null;
  className?: string;
  placeholderIconClassName?: string;
  placeholderIconStrokeWidth?: number;
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
        <User
          className={placeholderIconClassName}
          strokeWidth={placeholderIconStrokeWidth}
        />
      )}
    </div>
  );
}

function SocialProofStrip({
  social,
  endorsementCount,
  givenEndorsementCount,
  isSelf,
  meta,
  onOpenStanceDetail,
  onOpenNetwork,
  onOpenEndorsements,
}: {
  social: ProfileSocialResponse;
  endorsementCount: number;
  givenEndorsementCount: number;
  isSelf: boolean;
  meta?: ReactNode;
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
      {meta || previewAccounts.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {previewAccounts.length > 0 ? (
            <button
              type="button"
              onClick={onOpenNetwork}
              className="group inline-flex items-center gap-2 rounded-md py-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60"
              aria-label={
                isSelf ? 'View your standing network' : 'View standing network'
              }
            >
              <PortalHoverTooltip
                className="inline-flex items-center gap-2"
                tooltip="Open network"
              >
                <span
                  className={cn(
                    columnLabel,
                    'transition-colors group-hover:text-muted-foreground/70'
                  )}
                >
                  Network
                </span>
                <span className="flex items-center">
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
                </span>
              </PortalHoverTooltip>
            </button>
          ) : null}
          {meta && previewAccounts.length > 0 ? (
            <span className="h-1 w-1 rounded-full bg-muted-foreground/25" />
          ) : null}
          {meta}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div>
          <div className={columnLabel}>Standing</div>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12px]">
            <button
              type="button"
              onClick={() => onOpenStanceDetail('incoming')}
              className={cn(
                metricBtn,
                'focus-visible:ring-[var(--portal-blue-focus-border)]'
              )}
              aria-label={
                isSelf
                  ? `${formatCount(incomingCount)} stand with you`
                  : `${formatCount(incomingCount)} stand with them`
              }
            >
              <PortalHoverTooltip
                className="inline-flex items-center gap-1"
                tooltip="Stand with them"
              >
                <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]" />
                <span
                  className={cn(
                    'font-bold tabular-nums text-[var(--portal-blue)]',
                    incomingCount === 0 && 'opacity-40'
                  )}
                >
                  {formatCount(incomingCount)}
                </span>
              </PortalHoverTooltip>
            </button>
            <button
              type="button"
              onClick={() => onOpenStanceDetail('outgoing')}
              className={cn(
                metricBtn,
                'focus-visible:ring-[var(--portal-blue-focus-border)]'
              )}
              aria-label={
                isSelf
                  ? `You stand with ${formatCount(outgoingCount)}`
                  : `They stand with ${formatCount(outgoingCount)}`
              }
            >
              <PortalHoverTooltip
                className="inline-flex items-center gap-1"
                tooltip="They stand with"
              >
                <span
                  className={cn(
                    'font-bold tabular-nums text-[var(--portal-blue)]',
                    outgoingCount === 0 && 'opacity-40'
                  )}
                >
                  {formatCount(outgoingCount)}
                </span>
                <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]" />
              </PortalHoverTooltip>
            </button>
          </div>
        </div>

        <div>
          <div className={columnLabel}>Solidarity</div>
          <div className="mt-1 flex items-center whitespace-nowrap text-[12px]">
            <button
              type="button"
              onClick={() => onOpenStanceDetail('mutual')}
              className={cn(
                metricBtn,
                'focus-visible:ring-[var(--portal-purple-border)]'
              )}
              aria-label={`${formatCount(mutualCount)} solidarity connections`}
            >
              <PortalHoverTooltip
                className="inline-flex items-center gap-1"
                tooltip="Mutual standing"
              >
                <ProtocolMotionArrow
                  direction="in"
                  className="h-2 w-2 text-[var(--portal-purple)]"
                />
                <span
                  className={cn(
                    'font-bold tabular-nums text-[var(--portal-purple)]',
                    mutualCount === 0 && 'opacity-40'
                  )}
                >
                  {formatCount(mutualCount)}
                </span>
                <ProtocolMotionArrow className="h-2 w-2 text-[var(--portal-purple)]" />
              </PortalHoverTooltip>
            </button>
          </div>
        </div>

        <div>
          <div className={columnLabel}>Endorsements</div>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12px]">
            <button
              type="button"
              onClick={() => onOpenEndorsements('received')}
              className={cn(
                metricBtn,
                'focus-visible:ring-[var(--portal-gold-accent)]'
              )}
              aria-label={`${formatCount(endorsementCount)} endorsements received`}
            >
              <PortalHoverTooltip
                className="inline-flex items-center gap-1"
                tooltip="Endorsements received"
              >
                <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-gold)]" />
                <span
                  className={cn(
                    'font-bold tabular-nums text-[var(--portal-gold)]',
                    endorsementCount === 0 && 'opacity-40'
                  )}
                >
                  {formatCount(endorsementCount)}
                </span>
              </PortalHoverTooltip>
            </button>
            <button
              type="button"
              onClick={() => onOpenEndorsements('given')}
              className={cn(
                metricBtn,
                'focus-visible:ring-[var(--portal-gold-accent)]'
              )}
              aria-label={`${formatCount(givenEndorsementCount)} endorsements given`}
            >
              <PortalHoverTooltip
                className="inline-flex items-center gap-1"
                tooltip="Endorsements given"
              >
                <span
                  className={cn(
                    'font-bold tabular-nums text-[var(--portal-gold)]',
                    givenEndorsementCount === 0 && 'opacity-40'
                  )}
                >
                  {formatCount(givenEndorsementCount)}
                </span>
                <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-gold)]" />
              </PortalHoverTooltip>
            </button>
          </div>
        </div>
      </div>

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
                tier.accent === 'gold'
                  ? 'portal-gold-badge text-[var(--portal-gold)]'
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
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );
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
      const bio = account.bio?.toLowerCase() ?? '';
      return (
        label.includes(normalizedQuery) ||
        accountId.includes(normalizedQuery) ||
        bio.includes(normalizedQuery)
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
  const canDiscoverFromHeader = Boolean(onDiscoverProfiles) && kind !== 'incoming';

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
              'relative flex h-[min(720px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
              portalElevatedShadowClass
            )}
          >
            <ModalHeader
              titleId="stance-detail-title"
              title={title}
              description={modalMeta}
              descriptionVariant="meta"
              actions={
                <>
                  {canDiscoverFromHeader ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onDiscoverProfiles?.();
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                      aria-label="Discover profiles"
                    >
                      <PortalHoverTooltip tooltip="Discover profiles">
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                      </PortalHoverTooltip>
                    </button>
                  ) : null}
                  <ModalCloseButton
                    ariaLabel={modalCloseLabel}
                    onClick={onClose}
                  />
                </>
              }
            />

            {accounts.length > 0 ? (
              <div className="shrink-0 px-4 pb-4 md:px-5">
                <SearchInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search profiles"
                  size="sm"
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
                pendingStandingIds={pendingStandingIds}
                onUpdateStanding={async (account, shouldStand) => {
                  if (!onUpdateAccountStanding || pendingStandingIds.has(account.accountId)) return;
                  setPendingStandingIds((prev) => new Set(prev).add(account.accountId));
                  try {
                    await onUpdateAccountStanding(account, shouldStand);
                  } catch {
                    // The parent surfaces the transaction error in the profile modal.
                  } finally {
                    setPendingStandingIds((prev) => {
                      const next = new Set(prev);
                      next.delete(account.accountId);
                      return next;
                    });
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
  emptyLabel,
  emptyCta,
  viewerAccountId,
  pendingStandingIds,
  onSelectAccount,
  onUpdateStanding,
}: {
  accounts: StandingAccountSummary[];
  emptyLabel: string;
  emptyCta?: ReactNode;
  viewerAccountId: string | null;
  pendingStandingIds?: Set<string>;
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
        const canUpdateStanding =
          Boolean(viewerAccountId) &&
          viewerAccountId !== account.accountId &&
          Boolean(onUpdateStanding);
        const isRowPending = pendingStandingIds?.has(account.accountId) ?? false;
        const viewerStandsWithAccount = Boolean(account.viewerStanding);
        const canShowViewerRelationship =
          Boolean(viewerAccountId) && viewerAccountId !== account.accountId;
        const theyStandWithViewer =
          canShowViewerRelationship && Boolean(account.theyStandWithViewer);
        const sharedSolidarity = viewerStandsWithAccount && theyStandWithViewer;
        const bio = account.bio?.trim();
        const timeMeta = standingTimeMeta(account);
        return (
          <div
            key={account.accountId}
            className="flex w-full min-w-0 items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--portal-slate-bg)] focus-within:bg-[var(--portal-slate-bg)]"
          >
            <button
              type="button"
              onClick={() => onSelectAccount?.(account.accountId)}
              className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none"
            >
              <AccountAvatar
                avatarUrl={account.avatarUrl}
                className="mt-0.5 h-9 w-9 transition-shadow group-hover:ring-1 group-hover:ring-foreground/15"
              />
              <span className="min-w-0 flex-1">
                {sharedSolidarity || theyStandWithViewer ? (
                  <span className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {sharedSolidarity ? (
                      <RelationshipSignal
                        label="Solidarity"
                        tone="purple"
                        title="You both stand with each other"
                      />
                    ) : (
                      <RelationshipSignal
                        label="Stands with you"
                        tone="blue"
                        title="This account stands with you"
                      />
                    )}
                  </span>
                ) : null}
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {accountLabel(account)}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground/55">
                  @{account.accountId}
                </span>
                {bio ? (
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/60">
                    {bio}
                  </span>
                ) : null}
                <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground/65">
                  <PortalHoverTooltip
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    aria-label={`${formatCount(account.standingCount ?? 0)} stand with them`}
                    stopPropagation
                    tooltip="Stand with them"
                  >
                    <ProtocolMotionArrow
                      static
                      className="h-2.5 w-2.5 text-[var(--portal-blue)]/55"
                    />
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-[var(--portal-blue)]/85',
                        (account.standingCount ?? 0) === 0 && 'opacity-40'
                      )}
                    >
                      {formatCount(account.standingCount ?? 0)}
                    </span>
                  </PortalHoverTooltip>
                  <PortalHoverTooltip
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    aria-label={`They stand with ${formatCount(account.standingWithCount ?? 0)}`}
                    stopPropagation
                    tooltip="They stand with"
                  >
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-[var(--portal-blue)]/85',
                        (account.standingWithCount ?? 0) === 0 && 'opacity-40'
                      )}
                    >
                      {formatCount(account.standingWithCount ?? 0)}
                    </span>
                    <ProtocolMotionArrow
                      static
                      className="h-2.5 w-2.5 text-[var(--portal-blue)]/55"
                    />
                  </PortalHoverTooltip>
                  <span className="text-muted-foreground/25" aria-hidden="true">
                    ·
                  </span>
                  <PortalHoverTooltip
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    aria-label={`${formatCount(account.mutualStandingCount ?? 0)} solidarity connections`}
                    stopPropagation
                    tooltip="Solidarity"
                  >
                    <ProtocolMotionArrow
                      direction="in"
                      static
                      className="h-2 w-2 text-[var(--portal-purple)]/65"
                    />
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-[var(--portal-purple)]/85',
                        (account.mutualStandingCount ?? 0) === 0 &&
                          'opacity-40'
                      )}
                    >
                      {formatCount(account.mutualStandingCount ?? 0)}
                    </span>
                    <ProtocolMotionArrow
                      static
                      className="h-2 w-2 text-[var(--portal-purple)]/65"
                    />
                  </PortalHoverTooltip>
                  <span className="text-muted-foreground/25" aria-hidden="true">
                    ·
                  </span>
                  <PortalHoverTooltip
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    aria-label={`${formatCount(account.endorsementsReceivedCount ?? 0)} endorsements received and ${formatCount(account.endorsementsGivenCount ?? 0)} given`}
                    stopPropagation
                    tooltip="Endorsements"
                  >
                    <ProtocolMotionArrow
                      static
                      className="h-2.5 w-2.5 text-[var(--portal-gold)]/65"
                    />
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-[var(--portal-gold)]/85',
                        (account.endorsementsReceivedCount ?? 0) === 0 &&
                          'opacity-40'
                      )}
                    >
                      {formatCount(account.endorsementsReceivedCount ?? 0)}
                    </span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-[var(--portal-gold)]/85',
                        (account.endorsementsGivenCount ?? 0) === 0 &&
                          'opacity-40'
                      )}
                    >
                      {formatCount(account.endorsementsGivenCount ?? 0)}
                    </span>
                    <ProtocolMotionArrow
                      static
                      className="h-2.5 w-2.5 text-[var(--portal-gold)]/65"
                    />
                  </PortalHoverTooltip>
                </span>
              </span>
            </button>

            <span className="flex shrink-0 flex-col items-end gap-1">
              <PortalHoverTooltip
                className={cn(
                  'text-right text-[10px] tabular-nums text-muted-foreground/50',
                  !timeMeta && 'invisible'
                )}
                aria-hidden={!timeMeta}
                aria-label={timeMeta?.description}
                stopPropagation
                tooltip={timeMeta?.description}
              >
                {timeMeta?.label || '0d ago'}
              </PortalHoverTooltip>
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
                    disabled={isRowPending}
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
                    {viewerStandsWithAccount ? (
                      <>
                        <span className="inline-flex items-center gap-1 group-hover:hidden group-focus-visible:hidden">
                          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]/50" />
                          Standing
                        </span>
                        <span className="hidden items-center gap-1 group-hover:inline-flex group-focus-visible:inline-flex">
                          <ProtocolMotionArrow direction="left" className="h-2.5 w-2.5" />
                          Step back
                        </span>
                      </>
                    ) : (
                      <>
                        <ProtocolMotionArrow className="h-2.5 w-2.5" />
                        Stand
                      </>
                    )}
                  </button>
                )
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AccountFactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[12px]">
      <dt className="text-muted-foreground/58">{label}</dt>
      <dd className="max-w-[60%] truncate text-right font-medium text-foreground/86">
        {value}
      </dd>
    </div>
  );
}

function AccountFactSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/45">
        {title}
      </h3>
      <dl className="divide-y divide-fade-item">{children}</dl>
    </section>
  );
}

function fieldStatus(value?: string | null): string {
  return value?.trim() ? 'Set' : 'Not set';
}

function linkStatus(links?: Record<string, string>): string {
  return links && Object.values(links).some((value) => value.trim())
    ? 'Set'
    : 'Not set';
}

function AccountFactsModal({
  open,
  onOpenChange,
  accountId,
  displayName,
  avatarUrl,
  profile,
  latestProfileUpdateFields,
  joinedLabel,
  network,
  nearAccount,
  nearAccountExplorerUrl,
  nearAccountCreation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  profile: MaterialisedProfile | null;
  latestProfileUpdateFields: string[];
  joinedLabel: string | null;
  network?: 'testnet' | 'mainnet';
  nearAccount?: PortalProfileResponse['nearAccount'];
  nearAccountExplorerUrl?: string;
  nearAccountCreation?: PortalProfileResponse['nearAccountCreation'];
}) {
  const reduceMotion = useReducedMotion();
  const lastProfileUpdate = profileDateLabel(profile?.lastUpdatedAt);
  const updatedFieldsLabel =
    latestProfileUpdateFields.length > 0
      ? latestProfileUpdateFields.join(' · ')
      : null;
  const accountCreatedLabel = profileDateLabel(
    nearAccountCreation?.blockTimestamp
  );
  const accountCreatedUrl =
    nearAccountCreation?.explorerUrl ?? nearAccountExplorerUrl;
  const accountType = nearAccount
    ? nearAccount.codeHash === NEAR_EMPTY_CODE_HASH
      ? 'User account'
      : 'Contract account'
    : 'Unavailable';
  const storageUsed = nearAccount
    ? formatBytes(nearAccount.storageUsage)
    : 'Unavailable';

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
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
            aria-label="Close account facts"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 12,
              scale: 0.98,
              duration: 0.2,
              exitY: 8,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-facts-title"
            className={cn(
              'relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
              portalElevatedShadowClass
            )}
          >
            <ModalHeader
              titleId="account-facts-title"
              title="Account facts"
              description={accountId}
              descriptionVariant="meta"
              actions={
                <ModalCloseButton
                  ariaLabel="Close account facts"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div className="space-y-5 px-4 pb-5 md:px-5">
              <div className="flex items-center gap-3">
                <AccountAvatar avatarUrl={avatarUrl} className="h-10 w-10" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {displayName}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground/55">
                    @{accountId}
                  </p>
                </div>
              </div>

              <AccountFactSection title="OnSocial">
                <AccountFactRow
                  label="Joined OnSocial"
                  value={joinedLabel ?? 'Unavailable'}
                />
                <AccountFactRow
                  label="Last profile update"
                  value={lastProfileUpdate ?? 'Unavailable'}
                />
                {updatedFieldsLabel ? (
                  <AccountFactRow
                    label="Updated fields"
                    value={updatedFieldsLabel}
                  />
                ) : null}
              </AccountFactSection>

              <AccountFactSection title="Profile content">
                <AccountFactRow
                  label="Name"
                  value={fieldStatus(profile?.name)}
                />
                <AccountFactRow label="Bio" value={fieldStatus(profile?.bio)} />
                <AccountFactRow
                  label="Avatar"
                  value={fieldStatus(profile?.avatar)}
                />
                <AccountFactRow
                  label="Banner"
                  value={fieldStatus(profile?.banner)}
                />
                <AccountFactRow
                  label="Links"
                  value={linkStatus(profile?.links)}
                />
              </AccountFactSection>

              <AccountFactSection title="NEAR">
                <AccountFactRow
                  label="Network"
                  value={
                    network
                      ? network[0].toUpperCase() + network.slice(1)
                      : 'Unavailable'
                  }
                />
                {accountCreatedLabel ? (
                  <AccountFactRow
                    label="Account created"
                    value={
                      accountCreatedUrl ? (
                        <a
                          href={accountCreatedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group inline-flex items-center gap-1 text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue-hover)]"
                        >
                          {accountCreatedLabel}
                          <ProtocolMotionArrow className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        accountCreatedLabel
                      )
                    }
                  />
                ) : null}
                <AccountFactRow label="Account type" value={accountType} />
                <AccountFactRow label="NEAR storage used" value={storageUsed} />
              </AccountFactSection>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export function ProfileModal({
  open,
  accountId,
  viewerAccountId,
  selfProfile,
  selfAvatarUrl,
  selfBannerUrl,
  hasSocialSession = false,
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
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [firstProfileTimestamp, setFirstProfileTimestamp] = useState<
    number | null
  >(null);
  const [latestProfileUpdateFields, setLatestProfileUpdateFields] = useState<
    string[]
  >([]);
  const [profileNetwork, setProfileNetwork] =
    useState<PortalProfileResponse['network']>(undefined);
  const [nearAccount, setNearAccount] =
    useState<PortalProfileResponse['nearAccount']>(null);
  const [nearAccountExplorerUrl, setNearAccountExplorerUrl] = useState<
    string | undefined
  >(undefined);
  const [nearAccountCreation, setNearAccountCreation] =
    useState<PortalProfileResponse['nearAccountCreation']>(null);
  const [social, setSocial] = useState<ProfileSocialResponse | null>(null);
  const [profileSignals, setProfileSignals] =
    useState<ProfileSignalsResponse | null>(null);
  const [hasProfileLoaded, setHasProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<TransactionFeedback | null>(
    null
  );
  const [pendingStandingAction, setPendingStandingAction] = useState<
    'stand' | 'step-back' | null
  >(null);
  const [endorsementCount, setEndorsementCount] = useState(0);
  const [givenEndorsementCount, setGivenEndorsementCount] = useState(0);
  const [endorsementsModalIntent, setEndorsementsModalIntent] =
    useState<EndorsementsModalIntent | null>(null);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [accountFactsOpen, setAccountFactsOpen] = useState(false);
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
  const profileLinks = profileLinkItems(profile?.links);
  const joinedLabel = profileSinceLabel(firstProfileTimestamp);
  const canStand = Boolean(accountId && viewerAccountId && !isSelf);
  const viewerStanding = Boolean(social?.viewerStanding);
  const socialReady = Boolean(social || socialError);

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
    setAccountFactsOpen(false);
  }, [accountId, open]);

  useEffect(() => {
    if (!open || !accountId) return;

    let cancelled = false;
    setActionToast(null);

    if (isSelf && selfProfile) {
      setProfile(selfProfile);
      setAvatarUrl(selfAvatarUrl);
      setBannerUrl(selfBannerUrl);
      setFirstProfileTimestamp(null);
      setLatestProfileUpdateFields([]);
      setProfileNetwork(undefined);
      setNearAccount(null);
      setNearAccountExplorerUrl(undefined);
      setNearAccountCreation(null);
      setHasProfileLoaded(true);
    } else {
      setProfile(null);
      setAvatarUrl(null);
      setBannerUrl(null);
      setFirstProfileTimestamp(null);
      setLatestProfileUpdateFields([]);
      setProfileNetwork(undefined);
      setNearAccount(null);
      setNearAccountExplorerUrl(undefined);
      setNearAccountCreation(null);
      setHasProfileLoaded(false);
    }

    setProfileError(null);

    void fetchPortalProfile(accountId)
      .then((result) => {
        if (cancelled) return;
        setProfile(result.profile);
        setAvatarUrl(result.avatarUrl);
        setBannerUrl(result.bannerUrl);
        setFirstProfileTimestamp(result.firstProfileTimestamp);
        setLatestProfileUpdateFields(result.latestProfileUpdateFields);
        setProfileNetwork(result.network);
        setNearAccount(result.nearAccount ?? null);
        setNearAccountExplorerUrl(result.nearAccountExplorerUrl);
        setNearAccountCreation(result.nearAccountCreation ?? null);
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
  }, [accountId, isSelf, open, selfAvatarUrl, selfBannerUrl, selfProfile]);

  useEffect(() => {
    if (!open || !accountId) return;
    void refreshSocial();
    void refreshProfileSignals();
  }, [accountId, open, refreshProfileSignals, refreshSocial]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  const handleAccountStanding = async (
    account: StandingAccountSummary,
    shouldStand: boolean
  ) => {
    if (!viewerAccountId || account.accountId === viewerAccountId) return;

    setActionToast(null);

    try {
      await onUpdateStanding(account.accountId, shouldStand);
      const now = Date.now();

      setSocial((prev: ProfileSocialResponse | null) => {
        if (!prev) return prev;
        const updateList = (list: StandingAccountSummary[]) =>
          list.map((a) =>
            a.accountId === account.accountId
              ? {
                  ...a,
                  viewerStanding: shouldStand,
                  standingSince: shouldStand ? (a.standingSince ?? now) : null,
                  standingBlockTimestamp: shouldStand
                    ? (a.standingBlockTimestamp ?? now)
                    : null,
                }
              : a
          );
        const delta = shouldStand ? 1 : -1;
        const isTarget = account.accountId === prev.accountId;
        return {
          ...prev,
          viewerStanding: isTarget ? shouldStand : prev.viewerStanding,
          counts: isTarget
            ? {
                ...prev.counts,
                incoming: Math.max(0, prev.counts.incoming + delta),
              }
            : prev.counts,
          incoming: updateList(prev.incoming),
          outgoing: updateList(prev.outgoing),
        };
      });
    } catch (error) {
      if (isWalletUserCancellation(error)) throw error;
      reportWalletActionFailure(error, (msg) =>
        setActionToast({ type: 'error', msg })
      );
      throw error;
    }
  };

  const handleStanding = async () => {
    if (!accountId || !viewerAccountId || !canStand || pendingStandingAction) {
      return;
    }

    const nextStanding = !viewerStanding;

    setActionToast(null);
    setPendingStandingAction(nextStanding ? 'stand' : 'step-back');

    try {
      await onUpdateStanding(accountId, nextStanding);
      const now = Date.now();

      setSocial((prev: ProfileSocialResponse | null) => {
        if (!prev || !viewerAccountId) return prev;
        const delta = nextStanding ? 1 : -1;

        const updatedIncoming = nextStanding
          ? prev.incoming.some((a) => a.accountId === viewerAccountId)
            ? prev.incoming
            : [
                ...prev.incoming,
                {
                  accountId: viewerAccountId,
                  name: selfProfile?.name ?? null,
                  bio: selfProfile?.bio ?? null,
                  avatarUrl: selfAvatarUrl,
                  standingSince: now,
                  standingBlockTimestamp: now,
                  viewerStanding: true,
                  theyStandWithViewer: false,
                },
              ]
          : prev.incoming.filter((a) => a.accountId !== viewerAccountId);

        return {
          ...prev,
          viewerStanding: nextStanding,
          counts: {
            ...prev.counts,
            incoming: Math.max(0, prev.counts.incoming + delta),
          },
          incoming: updatedIncoming,
        };
      });
    } catch (error) {
      if (!isWalletUserCancellation(error)) {
        reportWalletActionFailure(error, (msg) =>
          setActionToast({ type: 'error', msg })
        );
      }
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

  return (
    <>
      {createPortal(
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/18 bg-black/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_-20px_rgba(0,0,0,0.56)] backdrop-blur-xl backdrop-saturate-150 transition-colors hover:border-white/28 hover:bg-black/30 hover:text-white"
                    aria-label="Edit profile"
                  >
                    <PortalHoverTooltip tooltip="Edit profile">
                      <PenLine className="h-4 w-4" />
                    </PortalHoverTooltip>
                  </button>
                ) : null}
                <ModalCloseButton
                  ariaLabel="Close profile"
                  onClick={() => onOpenChange(false)}
                  className="border-white/18 bg-black/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_-20px_rgba(0,0,0,0.56)] backdrop-blur-xl backdrop-saturate-150 hover:border-white/28 hover:bg-black/30 hover:text-white"
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
                  <div className="relative aspect-[5/1] shrink-0 overflow-hidden">
                    {bannerUrl ? (
                      <img
                        src={bannerUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: accountGradient(accountId),
                        }}
                      />
                    )}
                    {!bannerUrl ? (
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[hsl(var(--background)/0.98)] to-transparent" />
                    ) : null}
                  </div>

                  <div className="relative -mt-8 space-y-3 px-4 pb-5 md:px-5">
                    <div className="flex items-start gap-3.5">
                      <AccountAvatar
                        avatarUrl={avatarUrl}
                        className="h-20 w-20 md:h-24 md:w-24 rounded-2xl !border-[3px] !border-background shadow-lg"
                        placeholderIconClassName="h-6 w-6"
                        placeholderIconStrokeWidth={2.5}
                      />
                      <div className="min-w-0 flex-1 pt-10 pr-8">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <h2
                            id="profile-modal-title"
                            className="min-w-0 truncate text-lg font-semibold leading-tight text-foreground"
                          >
                            {title}
                          </h2>
                          {profileLinks.length > 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-1">
                              {profileLinks.map((item) => (
                                <a
                                  key={item.key}
                                  href={item.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    'text-muted-foreground transition-all hover:scale-110 hover:brightness-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60',
                                    item.kind === 'website' &&
                                      'hover:text-[var(--portal-blue)]',
                                    item.kind === 'telegram' &&
                                      'hover:text-[#26A5E4]',
                                    item.kind === 'x' && 'hover:text-foreground',
                                    item.kind === 'github' &&
                                      'hover:text-[var(--portal-purple)]'
                                  )}
                                  aria-label={`${item.label}: ${item.display}`}
                                >
                                  <PortalHoverTooltip
                                    tooltip={`${item.label}: ${item.display}`}
                                  >
                                    <ProfileLinkIcon
                                      kind={item.kind}
                                      className="h-[18px] w-[18px]"
                                    />
                                  </PortalHoverTooltip>
                                </a>
                              ))}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground/55">
                          @{accountId}
                        </p>
                      </div>
                    </div>

                    {bio ? (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {bio}
                      </p>
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
                        meta={
                          joinedLabel || canStand ? (
                            <span className="inline-flex flex-wrap items-center gap-2">
                              {joinedLabel ? (
                                <button
                                  type="button"
                                  onClick={() => setAccountFactsOpen(true)}
                                  className="group inline-flex items-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground/55 transition-colors hover:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60"
                                  aria-label={`View account facts for ${title}`}
                                >
                                  Joined {joinedLabel}
                                  <ProtocolMotionArrow className="h-2.5 w-2.5" />
                                </button>
                              ) : null}
                              {joinedLabel && canStand ? (
                                <span className="h-1 w-1 rounded-full bg-muted-foreground/25" />
                              ) : null}
                              {canStand ? (
                                pendingStandingAction ? (
                                  <span
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
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className={cn(
                                      profileActionButtonClass(
                                        viewerStanding ? 'slate' : 'blue'
                                      )
                                    )}
                                    disabled={!canStand || Boolean(pendingStandingAction)}
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
                                        <span className="inline-flex items-center gap-1 group-hover:hidden group-focus-visible:hidden">
                                          <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-blue)]/50" />
                                          Standing
                                        </span>
                                        <span className="hidden items-center gap-1 group-hover:inline-flex group-focus-visible:inline-flex">
                                          <ProtocolMotionArrow direction="left" className="h-2.5 w-2.5" />
                                          Step back
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <ProtocolMotionArrow className="h-2.5 w-2.5" />
                                        {hasSocialSession
                                          ? 'Stand with'
                                          : 'Authorize & stand'}
                                      </>
                                    )}
                                  </button>
                                )
                              ) : null}
                            </span>
                          ) : null
                        }
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
                      selfAvatarUrl={selfAvatarUrl}
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

              {(profileError && !isWalletCancellationMessage(profileError)) ||
              (socialError && !isWalletCancellationMessage(socialError)) ? (
                <p className="mx-4 mt-4 mb-5 rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)] md:mx-5">
                  {profileError && !isWalletCancellationMessage(profileError)
                    ? profileError
                    : socialError}
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
          <AccountFactsModal
            open={accountFactsOpen}
            onOpenChange={setAccountFactsOpen}
            accountId={accountId}
            displayName={title}
            avatarUrl={avatarUrl}
            profile={profile}
            latestProfileUpdateFields={latestProfileUpdateFields}
            joinedLabel={joinedLabel}
            network={profileNetwork}
            nearAccount={nearAccount}
            nearAccountExplorerUrl={nearAccountExplorerUrl}
            nearAccountCreation={nearAccountCreation}
          />
        </motion.div>
      ) : null}
        </AnimatePresence>,
        document.body
      )}
      <TransactionFeedbackToast
        result={actionToast}
        onClose={() => setActionToast(null)}
      />
    </>
  );
}
