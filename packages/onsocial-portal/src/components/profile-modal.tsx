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
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Github, Globe, HeartHandshake, PenLine, User } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import type { MaterialisedProfile } from '@onsocial/sdk';
import type { PortalProfileShell } from '@/lib/portal-profile-server';
import type { EndorsementSubmitInput } from '@/lib/endorsements';
import {
  compactModalBodyClass,
  compactModalShellClass,
  portalElevatedShadowClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import {
  ModalFactRow,
  ModalFactSection,
} from '@/components/ui/modal-fact-list';
import { ModalHeader } from '@/components/ui/modal-header';
import {
  profileActionButtonClass,
  profileSocialStandingButtonClass,
  profileSocialMetaRowClass,
  profileSocialMetaRowItemClass,
  walletMenuActionButtonClass,
} from '@/components/ui/profile-action-pill';
import {
  ProfileSocialStandingPending,
  ProfileSocialStandingToggle,
} from '@/components/ui/profile-social-standing-toggle';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { NetworkModal, type NetworkAccount } from '@/components/network-modal';
import { PlatformStorageAllowanceSummary } from '@/components/platform-storage-allowance-summary';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import {
  TransactionFeedbackToast,
  type TransactionFeedback,
} from '@/components/ui/transaction-feedback-toast';
import { ProfileEndorsements } from '@/components/profile-endorsements';
import { ProfileSupportModal } from '@/components/profile-support-modal';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { usePlatformStorageSummary } from '@/hooks/use-platform-storage-summary';
import { PLATFORM_STORAGE_LABEL } from '@/lib/platform-storage-display';
import type { StandingUpdateResult } from '@/contexts/profile-context';
import {
  commitmentLabel,
  formatReputation,
  formatScore,
  reputationTier,
  type ReputationEntry,
} from '@/lib/leaderboard';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { formatProfilePageNavLabel } from '@/lib/nav-badge-label';
import {
  getPortalEndorsementsUrl,
  getPortalStandUrl,
  type PortalEndorsementsMode,
} from '@/lib/portal-config';
import {
  type StandingAccountSummary,
  type StanceDetailKind,
} from '@/lib/profile-social-standings';
import {
  profilePageBannerSurfaceClass,
  profilePageHorizontalPaddingClass,
  profilePageMobileContentMarginClass,
  profilePageMobileGutterClass,
} from '@/lib/profile-page-layout';
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
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import {
  fetchProfileSupportBalanceYocto,
  formatSupportBalanceLabel,
} from '@/lib/social-spend-profile';

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

interface ProfileSocialResponse {
  accountId: string;
  viewerAccountId: string | null;
  viewerStanding: boolean;
  counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  incoming: StandingAccountSummary[];
  outgoing: StandingAccountSummary[];
}

const socialMetricBtnClass =
  'group inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1';

const profileIdentityLayoutClass =
  '[--profile-avatar-size:5rem] md:[--profile-avatar-size:6rem]';

const profileIdentityOverlapClass = '-mt-[calc(var(--profile-avatar-size)/2)]';

const profileIdentityAvatarSizeClass =
  'h-[var(--profile-avatar-size)] w-[var(--profile-avatar-size)]';

const profileIdentityTextClass =
  'min-w-0 flex-1 space-y-0.5 pb-1 pt-[calc(var(--profile-avatar-size)/2+0.375rem)]';

interface ProfileSignalsResponse {
  accountId: string;
  reputation: ReputationEntry | null;
}

interface PortalProfileBundleResponse {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  firstProfileTimestamp: number | null;
  latestProfileUpdateFields: string[];
  network?: PortalProfileResponse['network'];
  nearAccount: PortalProfileResponse['nearAccount'];
  nearAccountExplorerUrl?: string;
  nearAccountCreation: PortalProfileResponse['nearAccountCreation'];
  social?: ProfileSocialResponse;
  signals?: ProfileSignalsResponse;
}

interface ProfileModalProps {
  open: boolean;
  accountId: string | null;
  initialShell?: PortalProfileShell | null;
  viewerAccountId: string | null;
  selfProfile: MaterialisedProfile | null;
  selfAvatarUrl: string | null;
  selfBannerUrl: string | null;
  hasSocialSession?: boolean;
  isAuthorizingSession?: boolean;
  variant?: 'modal' | 'page';
  onOpenChange: (open: boolean) => void;
  onEditProfile: () => void;
  onSelectAccount?: (accountId: string) => void;
  onDiscoverProfiles?: () => void;
  onPageNavLabel?: (label: string) => void;
  onUpdateStanding: (
    accountId: string,
    shouldStand: boolean
  ) => Promise<StandingUpdateResult>;
  onEndorse?: (
    target: string,
    input: EndorsementSubmitInput
  ) => Promise<unknown>;
  onRemoveEndorsement?: (target: string, topic?: string) => Promise<unknown>;
  onSupportProfile?: (
    targetAccount: string,
    amountYocto: string
  ) => Promise<string[]>;
  onClaimSupportBalance?: () => Promise<string[]>;
  isSupportingProfile?: boolean;
  isClaimingSupportBalance?: boolean;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile request failed';
}

async function fetchPortalProfileBundle(
  accountId: string,
  viewerAccountId: string | null
): Promise<PortalProfileBundleResponse> {
  const search = new URLSearchParams({
    accountId,
    bundle: 'social,signals',
  });
  if (viewerAccountId) {
    search.set('viewerAccountId', viewerAccountId);
  }

  const response = await fetch(`/api/profile?${search.toString()}`, {
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<PortalProfileBundleResponse> & {
        error?: string;
        detail?: string;
      })
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
    social: body?.social,
    signals: body?.signals,
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
      mutual: Number(body?.counts?.mutual ?? 0),
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

function accountGradient(accountId: string): string {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = ((hash << 5) - hash + accountId.charCodeAt(i)) | 0;
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 8) % 30)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 45% 60% / 0.14), hsl(${h2} 35% 55% / 0.08), transparent 80%)`;
}

function ProfileIdentityLoading({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <>
      <div
        className={cn(
          'aspect-[5/1] w-full bg-foreground/[0.03]',
          fullPage && profilePageBannerSurfaceClass
        )}
      />
      <div
        className={cn(
          'relative z-10 space-y-3 pb-5 md:px-5',
          profileIdentityLayoutClass,
          profileIdentityOverlapClass,
          fullPage
            ? cn('pb-12', profilePageHorizontalPaddingClass)
            : 'px-4 pb-5 md:px-5'
        )}
      >
        <div className="flex items-start gap-3.5">
          <Skeleton
            className={cn(
              'shrink-0 rounded-2xl !border-[3px] !border-background',
              profileIdentityAvatarSizeClass
            )}
          />
          <div className={cn(profileIdentityTextClass, 'space-y-1.5')}>
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
  onOpenEndorsements: (mode: PortalEndorsementsMode, topic?: string) => void;
}) {
  const incomingCount = social.counts.incoming;
  const outgoingCount = social.counts.outgoing;
  const mutualCount = social.counts.mutual;

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

  const uniqueNetworkCount = Math.max(
    0,
    incomingCount + outgoingCount - mutualCount
  );
  const overflowCount = Math.max(
    0,
    uniqueNetworkCount - previewAccounts.length
  );

  const metricBtn = socialMetricBtnClass;
  const columnLabel = 'portal-type-label font-medium text-muted-foreground/55';

  return (
    <div>
      {meta || previewAccounts.length > 0 ? (
        <div className={profileSocialMetaRowClass}>
          {previewAccounts.length > 0 ? (
            <button
              type="button"
              onClick={onOpenNetwork}
              className={cn(
                profileSocialMetaRowItemClass,
                'group gap-2 rounded-md text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60'
              )}
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
                    <span className="pl-1 portal-type-label font-medium tabular-nums text-muted-foreground/55 transition-colors group-hover:text-muted-foreground/70">
                      +{formatCount(overflowCount)}
                    </span>
                  ) : null}
                </span>
              </PortalHoverTooltip>
            </button>
          ) : null}
          {meta}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div>
          <div className={columnLabel}>Standing</div>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap portal-type-body-sm">
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
          <div className="mt-1 flex items-center whitespace-nowrap portal-type-body-sm">
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
                  className="h-2.5 w-2.5 text-[var(--portal-purple)]"
                />
                <span
                  className={cn(
                    'font-bold tabular-nums text-[var(--portal-purple)]',
                    mutualCount === 0 && 'opacity-40'
                  )}
                >
                  {formatCount(mutualCount)}
                </span>
                <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-purple)]" />
              </PortalHoverTooltip>
            </button>
          </div>
        </div>

        <div>
          <div className={columnLabel}>Endorsements</div>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap portal-type-body-sm">
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
            <span className="portal-type-display font-semibold tabular-nums tracking-[-0.025em] text-foreground">
              {formatReputation(reputation.reputation)}
            </span>

            <span
              className={cn(
                'rounded-full border px-2 py-px portal-type-caption font-medium',
                tier.accent === 'gold'
                  ? 'portal-gold-badge text-[var(--portal-gold)]'
                  : tier.accent === 'purple'
                    ? 'portal-purple-badge text-[var(--portal-purple)]'
                    : tier.accent === 'blue'
                      ? 'portal-blue-badge text-[var(--portal-blue)]'
                      : tier.accent === 'green'
                        ? 'portal-green-badge text-[var(--portal-green)]'
                        : 'portal-neutral-badge text-[var(--portal-neutral)]'
              )}
            >
              {tier.label}
            </span>

            {Number.isFinite(rank) && rank > 0 && (
              <span className="portal-type-caption text-muted-foreground/65 tabular-nums">
                #{formatCount(rank)}
              </span>
            )}
          </div>

          <span className="shrink-0 rounded-full border portal-blue-badge px-2 py-px portal-type-caption font-medium text-[var(--portal-blue)]">
            {profileSignalLabel}
          </span>
        </div>

        {/* Elegant single-line social proof */}
        <div className="mt-1.5 portal-type-body-sm text-muted-foreground/70">
          {formatCount(toFiniteNumber(reputation.totalPosts))} posts ·{' '}
          {formatCount(toFiniteNumber(reputation.reactionsReceived))} reactions
          · {formatCount(toFiniteNumber(reputation.activeDays))} active days ·{' '}
          {formatNumericCompact(reputation.rewardsEarned)} SOCIAL earned
        </div>

        {/* Reputation personality mix — refined and human */}
        <div className="mt-3">
          <div className="portal-eyebrow text-muted-foreground/50 mb-1.5">
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
                  className="flex items-center gap-2 portal-type-label"
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
            <div className="portal-eyebrow text-muted-foreground/50 mb-1">
              Recognized for
            </div>
            <div className="flex flex-wrap gap-1">
              {signalBadges.slice(0, 3).map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-border/30 bg-background/50 px-2 py-px portal-type-caption text-muted-foreground/80"
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
  avatarUrl: _avatarUrl,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open, scrollRef);
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

  const platformStorage = usePlatformStorageSummary(accountId, open);

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
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
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
              y: 14,
              scale: 0.98,
              duration: 0.22,
              exitY: 8,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-facts-title"
            className={cn(compactModalShellClass, portalElevatedShadowClass)}
          >
            <ModalHeader
              titleId="account-facts-title"
              title="Account facts"
              description={
                <>
                  <span className="font-medium text-foreground/80">
                    {displayName}
                  </span>
                  <span className="text-muted-foreground/45"> · </span>
                  <span>@{accountId}</span>
                </>
              }
              descriptionVariant="meta"
              bordered
              className="pb-3"
              actions={
                <ModalCloseButton
                  ariaLabel="Close account facts"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div ref={scrollRef} className={compactModalBodyClass}>
              <div className="divide-y divide-fade-section">
                <section className="py-3">
                  <ModalFactSection dense title="OnSocial">
                    <ModalFactRow
                      dense
                      label="Joined"
                      value={joinedLabel ?? 'Unavailable'}
                    />
                    <ModalFactRow
                      dense
                      label="Last update"
                      value={lastProfileUpdate ?? 'Unavailable'}
                    />
                    {updatedFieldsLabel ? (
                      <ModalFactRow
                        dense
                        label="Fields"
                        value={updatedFieldsLabel}
                        multiline
                      />
                    ) : null}
                  </ModalFactSection>
                </section>

                <section className="py-3">
                  <h3 className="mb-1 portal-eyebrow-wide text-muted-foreground/45">
                    {PLATFORM_STORAGE_LABEL}
                  </h3>
                  <PlatformStorageAllowanceSummary
                    variant="accountFacts"
                    loading={platformStorage.loading}
                    error={platformStorage.error}
                    summary={platformStorage.summary}
                  />
                </section>

                <section className="py-3">
                  <ModalFactSection dense title="Profile">
                    <ModalFactRow
                      dense
                      label="Name"
                      value={fieldStatus(profile?.name)}
                    />
                    <ModalFactRow
                      dense
                      label="Bio"
                      value={fieldStatus(profile?.bio)}
                    />
                    <ModalFactRow
                      dense
                      label="Avatar"
                      value={fieldStatus(profile?.avatar)}
                    />
                    <ModalFactRow
                      dense
                      label="Banner"
                      value={fieldStatus(profile?.banner)}
                    />
                    <ModalFactRow
                      dense
                      label="Links"
                      value={linkStatus(profile?.links)}
                    />
                  </ModalFactSection>
                </section>

                <section className="py-3">
                  <ModalFactSection dense title="NEAR">
                    <ModalFactRow
                      dense
                      label="Network"
                      value={
                        network
                          ? network[0].toUpperCase() + network.slice(1)
                          : 'Unavailable'
                      }
                    />
                    {accountCreatedLabel ? (
                      <ModalFactRow
                        dense
                        label="Created"
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
                    <ModalFactRow dense label="Type" value={accountType} />
                    <ModalFactRow
                      dense
                      label="Storage used"
                      value={storageUsed}
                      valueMono
                    />
                  </ModalFactSection>
                </section>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

function applyProfileSocial(
  body: ProfileSocialResponse | undefined
): ProfileSocialResponse | null {
  if (!body) return null;

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
    accountId: body.accountId,
    viewerAccountId: body.viewerAccountId ?? null,
    viewerStanding: Boolean(body.viewerStanding),
    counts: {
      incoming: Number(body.counts?.incoming ?? 0),
      outgoing: Number(body.counts?.outgoing ?? 0),
      mutual: Number(body.counts?.mutual ?? 0),
    },
    incoming: normalizeAccounts(body.incoming),
    outgoing: normalizeAccounts(body.outgoing),
  };
}

export function ProfileModal({
  open,
  accountId,
  initialShell = null,
  viewerAccountId,
  selfProfile,
  selfAvatarUrl,
  selfBannerUrl,
  hasSocialSession = false,
  isAuthorizingSession = false,
  variant = 'modal',
  onOpenChange,
  onEditProfile,
  onSelectAccount,
  onDiscoverProfiles,
  onPageNavLabel,
  onUpdateStanding,
  onEndorse,
  onRemoveEndorsement,
  onSupportProfile,
  onClaimSupportBalance,
  isSupportingProfile = false,
  isClaimingSupportBalance = false,
}: ProfileModalProps) {
  const isPage = variant === 'page';
  const active = Boolean(accountId) && (isPage || open);
  const reduceMotion = useReducedMotion();
  const router = useRouter();
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
  const [networkOpen, setNetworkOpen] = useState(false);
  const [accountFactsOpen, setAccountFactsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [claimableSupportYocto, setClaimableSupportYocto] = useState<bigint>(0n);
  const {
    txResult: claimTxResult,
    setTxResult: setClaimTxResult,
    clearTxResult: clearClaimTxResult,
    trackTransaction: trackClaimTransaction,
  } = useNearTransactionFeedback(viewerAccountId);
  const latestSocialLoadRef = useRef(0);
  const latestSignalsLoadRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSelf = Boolean(accountId && viewerAccountId === accountId);
  useBodyScrollLock(!isPage && active, scrollRef);
  const title = displayName(profile, accountId);
  const bio = profile?.bio?.trim();
  const profileLinks = profileLinkItems(profile?.links);
  const joinedLabel = profileSinceLabel(firstProfileTimestamp);
  const canStand = Boolean(accountId && viewerAccountId && !isSelf);
  const canSupport = Boolean(
    accountId && viewerAccountId && !isSelf && onSupportProfile
  );
  const canClaimSupport = Boolean(
    isSelf && accountId && onClaimSupportBalance && claimableSupportYocto > 0n
  );
  const viewerStanding = Boolean(social?.viewerStanding);
  const socialReady = Boolean(social || socialError);

  useEffect(() => {
    if (!isPage || !accountId || !onPageNavLabel) return;

    onPageNavLabel(
      formatProfilePageNavLabel({
        isSelf,
        accountId,
        displayName: title,
        profileLoaded: hasProfileLoaded,
      })
    );
  }, [accountId, hasProfileLoaded, isPage, isSelf, onPageNavLabel, title]);

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
    if (!active || !accountId) {
      latestSocialLoadRef.current += 1;
      latestSignalsLoadRef.current += 1;
      return;
    }

    setSocial(null);
    setProfileSignals(null);
    setSocialError(null);
    setEndorsementCount(0);
    setGivenEndorsementCount(0);
    setNetworkOpen(false);
    setAccountFactsOpen(false);
    setSupportOpen(false);
    setClaimableSupportYocto(0n);
    clearClaimTxResult();
  }, [accountId, active, clearClaimTxResult]);

  const refreshClaimableSupport = useCallback(async () => {
    if (!isSelf || !accountId) {
      setClaimableSupportYocto(0n);
      return;
    }
    try {
      const balance = await fetchProfileSupportBalanceYocto(accountId);
      setClaimableSupportYocto(balance);
    } catch {
      setClaimableSupportYocto(0n);
    }
  }, [accountId, isSelf]);

  useEffect(() => {
    if (!active || !isSelf || !accountId) return;
    void refreshClaimableSupport();
  }, [accountId, active, isSelf, refreshClaimableSupport]);

  const handleClaimSupport = useCallback(async () => {
    if (!onClaimSupportBalance || isClaimingSupportBalance) return;

    try {
      const txHashes = await onClaimSupportBalance();
      const confirmed = await trackClaimTransaction({
        txHashes,
        submittedMessage: 'Claiming support balance…',
        successMessage: 'Support SOCIAL claimed to your wallet.',
        failureMessage: 'Could not claim support balance.',
      });
      if (confirmed) {
        window.setTimeout(() => void refreshClaimableSupport(), 4_000);
      }
    } catch (error) {
      if (!isWalletUserCancellation(error)) {
        reportWalletActionFailure(error, (msg) =>
          setClaimTxResult({ type: 'error', msg })
        );
      }
    }
  }, [
    isClaimingSupportBalance,
    onClaimSupportBalance,
    refreshClaimableSupport,
    trackClaimTransaction,
  ]);

  useEffect(() => {
    if (!active || !accountId) return;

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
    } else if (initialShell?.accountId === accountId) {
      setProfile(initialShell.profile);
      setAvatarUrl(initialShell.avatarUrl);
      setBannerUrl(initialShell.bannerUrl);
      setFirstProfileTimestamp(null);
      setLatestProfileUpdateFields([]);
      setProfileNetwork(undefined);
      setNearAccount(null);
      setNearAccountExplorerUrl(undefined);
      setNearAccountCreation(null);
      setHasProfileLoaded(false);
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
    setSocial(null);
    setProfileSignals(null);
    setSocialError(null);

    void fetchPortalProfileBundle(accountId, viewerAccountId)
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

        const socialResult = applyProfileSocial(result.social);
        if (socialResult) {
          setSocial(socialResult);
        }
        if (result.signals) {
          setProfileSignals(result.signals);
        }
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
  }, [
    accountId,
    active,
    initialShell,
    isSelf,
    selfAvatarUrl,
    selfBannerUrl,
    selfProfile,
    viewerAccountId,
  ]);

  useEffect(() => {
    if (!isPage && !open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  const handleStanding = async () => {
    if (!accountId || !viewerAccountId || !canStand || pendingStandingAction) {
      return;
    }

    const nextStanding = !viewerStanding;

    setActionToast(null);
    setPendingStandingAction(nextStanding ? 'stand' : 'step-back');

    if (nextStanding && !hasSocialSession) {
      setActionToast({
        type: 'pending',
        eyebrow: 'Authorize & stand',
        msg: 'Approve the OnSocial session transaction in your wallet to finish.',
        pendingPhase: 'wallet',
      });
    }

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
      setActionToast(null);
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

  useEffect(() => {
    if (!pendingStandingAction || hasSocialSession || !isAuthorizingSession) {
      return;
    }

    setActionToast({
      type: 'pending',
      eyebrow: 'Authorize session',
      msg: 'Open your wallet extension and approve the OnSocial session transaction.',
      pendingPhase: 'wallet',
    });
  }, [hasSocialSession, isAuthorizingSession, pendingStandingAction]);

  const openEndorsementsPage = useCallback(
    (mode: PortalEndorsementsMode, topic?: string) => {
      if (!accountId) return;
      router.push(getPortalEndorsementsUrl(accountId, { mode, topic }));
    },
    [accountId, router]
  );

  const openStanceDetailPage = useCallback(
    (kind: StanceDetailKind) => {
      if (!accountId) return;
      router.push(getPortalStandUrl(accountId, kind));
    },
    [accountId, router]
  );

  if (typeof document === 'undefined' && !isPage) return null;

  const profileScrollBody =
    accountId && active ? (
      <>
        {!isPage ? (
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
        ) : null}

        {!hasProfileLoaded ? (
          <>
            <h2 id="profile-modal-title" className="sr-only">
              Profile
            </h2>
            <ProfileIdentityLoading fullPage={isPage} />
          </>
        ) : (
          <>
            <div
              className={cn(
                'relative aspect-[5/1] w-full shrink-0 overflow-hidden',
                isPage && profilePageBannerSurfaceClass
              )}
            >
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

            <div
              className={cn(
                'relative z-10 space-y-3 pb-5 md:pb-5',
                profileIdentityLayoutClass,
                profileIdentityOverlapClass,
                isPage
                  ? cn('pb-12', profilePageHorizontalPaddingClass)
                  : 'px-4 md:px-5'
              )}
            >
              <div
                className={cn('flex items-start gap-3.5', !isPage && 'pr-8')}
              >
                <AccountAvatar
                  avatarUrl={avatarUrl}
                  className={cn(
                    'shrink-0 rounded-2xl !border-[3px] !border-background shadow-lg',
                    profileIdentityAvatarSizeClass
                  )}
                  placeholderIconClassName="h-6 w-6"
                  placeholderIconStrokeWidth={2.5}
                />
                <div className={profileIdentityTextClass}>
                  <div className="flex items-center gap-3">
                    <h2
                      id="profile-modal-title"
                      className={cn(
                        'min-w-0 flex-1 truncate font-semibold leading-tight text-foreground',
                        isPage ? 'text-xl md:text-2xl' : 'text-lg'
                      )}
                    >
                      {title}
                    </h2>
                    {profileLinks.length > 0 ? (
                      <div className="flex shrink-0 items-center gap-2">
                        {profileLinks.map((item) => (
                          <a
                            key={item.key}
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              'text-muted-foreground/70 transition-all hover:scale-110 hover:brightness-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60',
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
                                className="h-4 w-4 shrink-0 md:h-[18px] md:w-[18px]"
                              />
                            </PortalHoverTooltip>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <p className="truncate portal-type-lead text-muted-foreground/55">
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
                      <Skeleton key={i} className="h-5 w-5 rounded-full" />
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
                    joinedLabel || canStand || canSupport || canClaimSupport ? (
                      <>
                        {joinedLabel ? (
                          <button
                            type="button"
                            onClick={() => setAccountFactsOpen(true)}
                            className={cn(
                              socialMetricBtnClass,
                              profileSocialMetaRowItemClass,
                              'portal-type-label font-medium text-muted-foreground/55 focus-visible:ring-border/60'
                            )}
                            aria-label={`View account facts for ${title}`}
                          >
                            <PortalHoverTooltip
                              className="inline-flex items-center gap-1"
                              tooltip="Account facts"
                            >
                              <span>Joined {joinedLabel}</span>
                              <ProtocolMotionArrow className="h-2.5 w-2.5 text-muted-foreground/55" />
                            </PortalHoverTooltip>
                          </button>
                        ) : null}
                        {canStand ? (
                          pendingStandingAction ? (
                            <span
                              className={profileSocialStandingButtonClass(
                                viewerStanding
                              )}
                              aria-live="polite"
                              aria-label={
                                viewerStanding
                                  ? 'Stepping back'
                                  : 'Confirming stance'
                              }
                            >
                              <ProfileSocialStandingPending
                                active={viewerStanding}
                                hasSocialSession={hasSocialSession}
                              />
                            </span>
                          ) : (
                            <PortalHoverTooltip
                              className={profileSocialMetaRowItemClass}
                              tooltip={
                                viewerStanding
                                  ? `Step back from ${title}`
                                  : `Stand with ${title}`
                              }
                            >
                              <button
                                type="button"
                                className={profileSocialStandingButtonClass(
                                  viewerStanding
                                )}
                                disabled={
                                  !canStand || Boolean(pendingStandingAction)
                                }
                                onClick={handleStanding}
                                aria-label={
                                  viewerStanding
                                    ? `Step back from ${title}`
                                    : `Stand with ${title}`
                                }
                              >
                                <ProfileSocialStandingToggle
                                  active={viewerStanding}
                                  hasSocialSession={hasSocialSession}
                                />
                              </button>
                            </PortalHoverTooltip>
                          )
                        ) : null}
                        {canSupport ? (
                          <PortalHoverTooltip
                            className={profileSocialMetaRowItemClass}
                            tooltip={`Send SOCIAL to ${title}`}
                          >
                            <button
                              type="button"
                              className={profileActionButtonClass('green')}
                              disabled={isSupportingProfile}
                              onClick={() => setSupportOpen(true)}
                              aria-label={`Support ${title} with SOCIAL`}
                            >
                              <HeartHandshake className="h-3 w-3" />
                              Support
                            </button>
                          </PortalHoverTooltip>
                        ) : null}
                        {canClaimSupport ? (
                          <PortalHoverTooltip
                            className={profileSocialMetaRowItemClass}
                            tooltip="Withdraw SOCIAL others sent you"
                          >
                            <button
                              type="button"
                              className={walletMenuActionButtonClass('claim-ready')}
                              disabled={isClaimingSupportBalance}
                              onClick={() => void handleClaimSupport()}
                              aria-label={`Claim ${formatSupportBalanceLabel(claimableSupportYocto)} SOCIAL support`}
                            >
                              Claim{' '}
                              {formatSupportBalanceLabel(claimableSupportYocto)}{' '}
                              SOCIAL
                            </button>
                          </PortalHoverTooltip>
                        ) : null}
                      </>
                    ) : null
                  }
                  onOpenStanceDetail={openStanceDetailPage}
                  onOpenNetwork={() => setNetworkOpen(true)}
                  onOpenEndorsements={openEndorsementsPage}
                />
              ) : null}

              {profileSignals?.reputation ? (
                <ProfileSignalsCard reputation={profileSignals.reputation} />
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
                pageLayout={isPage}
                onSelectAccount={isPage ? undefined : onSelectAccount}
                onEndorsementCountChange={setEndorsementCount}
                onGivenCountChange={setGivenEndorsementCount}
              />
            </div>
          </>
        )}

        {(profileError && !isWalletCancellationMessage(profileError)) ||
        (socialError && !isWalletCancellationMessage(socialError)) ? (
          <p
            className={cn(
              'rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]',
              isPage
                ? cn(
                    'mx-4 mt-4 mb-5 md:mx-5',
                    profilePageMobileContentMarginClass
                  )
                : 'mx-4 mt-4 mb-5 md:mx-5'
            )}
          >
            {profileError && !isWalletCancellationMessage(profileError)
              ? profileError
              : socialError}
          </p>
        ) : null}
      </>
    ) : null;

  const profileAuxModals =
    accountId && active ? (
      <>
        <NetworkModal
          open={networkOpen}
          centerAccountId={accountId}
          centerAvatarUrl={avatarUrl}
          centerDisplayName={title}
          accounts={networkAccounts}
          isSelf={isSelf}
          pageLayout={isPage}
          onClose={() => setNetworkOpen(false)}
          onSelectAccount={
            isPage
              ? undefined
              : (id) => {
                  setNetworkOpen(false);
                  onSelectAccount?.(id);
                }
          }
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
        {canSupport && accountId && onSupportProfile ? (
          <ProfileSupportModal
            open={supportOpen}
            targetAccountId={accountId}
            targetDisplayName={title}
            onOpenChange={setSupportOpen}
            onSupport={onSupportProfile}
          />
        ) : null}
      </>
    ) : null;

  const feedbackToast = (
    <>
      <TransactionFeedbackToast
        result={actionToast}
        onClose={() => setActionToast(null)}
      />
      <TransactionFeedbackToast
        result={claimTxResult}
        onClose={clearClaimTxResult}
      />
    </>
  );

  if (isPage) {
    if (!accountId || !active) return null;

    return (
      <>
        <div
          className={cn(
            'w-full min-w-0 overflow-x-clip',
            profilePageMobileGutterClass
          )}
        >
          {profileScrollBody}
        </div>
        {profileAuxModals}
        {feedbackToast}
      </>
    );
  }

  return (
    <>
      {createPortal(
        <AnimatePresence initial={false}>
          {active && accountId ? (
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
                  {profileScrollBody}
                </div>
              </motion.div>
              {profileAuxModals}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
      {feedbackToast}
    </>
  );
}
