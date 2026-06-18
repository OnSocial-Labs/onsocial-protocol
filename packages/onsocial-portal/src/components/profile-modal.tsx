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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Github, Globe, HeartHandshake, PenLine, User } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import type { MaterialisedProfile } from '@onsocial/sdk';
import type { PortalProfileShell } from '@/lib/portal-profile-server';
import { useProfile } from '@/contexts/profile-context';
import type {
  EndorsementSubmitInput,
  EndorsementWriteResult,
} from '@/lib/endorsements';
import type { EndorsementSupportSubmitInput } from '@/lib/social-spend-endorsement';
import { fetchEndorsementSupportGiven } from '@/lib/social-spend-endorsement';
import {
  compactModalBodyClass,
  compactModalShellClass,
  portalElevatedShadowClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import {
  ModalFactRow,
  ModalFactValueSkeleton,
  ModalFactSection,
} from '@/components/ui/modal-fact-list';
import { ModalHeader } from '@/components/ui/modal-header';
import {
  profileSocialEndorseButtonClass,
  profileSocialStandingButtonClass,
  profileSocialSupportButtonClass,
  walletMenuActionButtonClass,
} from '@/components/ui/profile-action-pill';
import {
  ProfileSocialStandingPending,
  ProfileSocialStandingToggle,
} from '@/components/ui/profile-social-standing-toggle';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import {
  ProfileIdentityLoading,
  ProfileSignalsBandSkeleton,
  profileIdentityActionsClass,
  profileIdentityAvatarDockClass,
  profileIdentityAvatarSizeClass,
  profileIdentityLayoutClass,
  profileIdentityMetaRowClass,
  profileIdentityOverlapClass,
  profileIdentityTextClass,
  ProfileStandingNetworkSkeleton,
} from '@/features/profile/profile-identity-loading';
import {
  ProfileRallyCredentials,
  useProfileRallyParticipations,
} from '@/features/season/profile-rally-credentials';
import { SeasonClaimInlineAction } from '@/features/season/season-claim-inline-action';
import { useProfileSeasonClaim } from '@/features/season/use-profile-season-claim';
import { NetworkModal, type NetworkAccount } from '@/components/network-modal';
import { PlatformStorageAllowanceSummary } from '@/components/platform-storage-allowance-summary';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import {
  TransactionFeedbackToast,
  type TransactionFeedback,
} from '@/components/ui/transaction-feedback-toast';
import { ProfileEndorsements } from '@/components/profile-endorsements';
import { ProfileSignalsBand } from '@/components/profile-signals-band';
import { ProfileSupportModal } from '@/components/profile-support-modal';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { usePlatformStorageSummary } from '@/hooks/use-platform-storage-summary';
import { useProfileNearFacts } from '@/hooks/use-profile-near-facts';
import { PLATFORM_STORAGE_LABEL } from '@/lib/platform-storage-display';
import type { StandingUpdateResult } from '@/contexts/profile-context';
import { type ReputationEntry } from '@/lib/leaderboard';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { formatProfilePageNavLabel } from '@/lib/nav-badge-label';
import {
  getPortalEndorsementsUrl,
  getPortalNetworkUrl,
  getPortalStandUrl,
  type PortalEndorsementsMode,
} from '@/lib/portal-config';
import {
  buildNetworkAccountsOrdered,
  standingSummaryToNetworkSource,
} from '@/lib/profile-network-accounts';
import {
  type StandingAccountSummary,
  type StanceDetailKind,
} from '@/lib/profile-social-standings';
import {
  graphRoutePrefetchProps,
  useProfileGraphRoutePrefetch,
} from '@/lib/profile-graph-link';
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
import { useLazyInView } from '@/hooks/use-lazy-in-view';
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
}

interface ProfileSocialResponse {
  accountId: string;
  viewerAccountId: string | null;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  endorsementCounts: {
    received: number;
    given: number;
  };
  mutual: StandingAccountSummary[];
  incoming: StandingAccountSummary[];
  outgoing: StandingAccountSummary[];
}

const socialMetricBtnClass =
  'group inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1';

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
    shouldStand: boolean,
    snapshot?: {
      accountId: string;
      name: string | null;
      avatarUrl: string | null;
      bio?: string | null;
    }
  ) => Promise<StandingUpdateResult>;
  onEndorse?: (
    target: string,
    input: EndorsementSubmitInput
  ) => Promise<EndorsementWriteResult>;
  onRemoveEndorsement?: (target: string, topic?: string) => Promise<unknown>;
  onSupportProfile?: (
    targetAccount: string,
    amountYocto: string
  ) => Promise<string[]>;
  onSupportEndorsement?: (
    input: EndorsementSupportSubmitInput
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

function isProfileRateLimitMessage(message: string): boolean {
  return /HTTP 429|rate limit|busy/i.test(message);
}

async function fetchPortalProfileBundle(
  accountId: string,
  viewerAccountId: string | null,
  options?: { fresh?: boolean }
): Promise<PortalProfileBundleResponse> {
  const search = new URLSearchParams({
    accountId,
    bundle: 'social,signals',
  });
  if (viewerAccountId) {
    search.set('viewerAccountId', viewerAccountId);
  }
  if (options?.fresh) {
    search.set('fresh', '1');
  }

  const url = `/api/profile?${search.toString()}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 900);
      });
    }

    const response = await fetch(url, { cache: 'no-store' });
    const body = (await response.json().catch(() => null)) as
      | (Partial<PortalProfileBundleResponse> & {
          error?: string;
          detail?: string;
        })
      | null;

    if (response.ok) {
      return {
        accountId,
        profile: body?.profile ?? null,
        avatarUrl: body?.avatarUrl ?? null,
        bannerUrl: body?.bannerUrl ?? null,
        firstProfileTimestamp: body?.firstProfileTimestamp ?? null,
        latestProfileUpdateFields: body?.latestProfileUpdateFields ?? [],
        network: body?.network,
        social: body?.social,
        signals: body?.signals,
      };
    }

    lastError = new Error(
      body?.detail ?? body?.error ?? `Profile query failed (${response.status})`
    );
    if (response.status !== 429) {
      throw lastError;
    }
  }

  throw lastError ?? new Error('Profile query failed (429)');
}

async function fetchProfileSocial(
  accountId: string,
  viewerAccountId: string | null,
  options?: { fresh?: boolean }
): Promise<ProfileSocialResponse> {
  const search = new URLSearchParams({ accountId });
  if (viewerAccountId) search.set('viewerAccountId', viewerAccountId);
  if (options?.fresh) search.set('fresh', '1');

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
    theyStandWithViewer: Boolean(body?.theyStandWithViewer),
    counts: {
      incoming: Number(body?.counts?.incoming ?? 0),
      outgoing: Number(body?.counts?.outgoing ?? 0),
      mutual: Number(body?.counts?.mutual ?? 0),
    },
    endorsementCounts: {
      received: Number(body?.endorsementCounts?.received ?? 0),
      given: Number(body?.endorsementCounts?.given ?? 0),
    },
    mutual: normalizeAccounts(body?.mutual),
    incoming: normalizeAccounts(body?.incoming),
    outgoing: normalizeAccounts(body?.outgoing),
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
  return accountId.replace(/\.(testnet|near|tg)$/u, '');
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

type ProfileLinkItem = ReturnType<typeof profileLinkItems>[number];

function ProfileSocialLinkIcons({
  links,
  className,
}: {
  links: ProfileLinkItem[];
  className?: string;
}) {
  if (links.length === 0) return null;

  return (
    <div
      className={cn('flex shrink-0 flex-wrap items-center gap-1.5', className)}
    >
      {links.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-all hover:scale-105 hover:brightness-125 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60',
            item.kind === 'website' && 'hover:text-[var(--portal-blue)]',
            item.kind === 'telegram' && 'hover:text-[#26A5E4]',
            item.kind === 'x' && 'hover:text-foreground',
            item.kind === 'github' && 'hover:text-[var(--portal-purple)]'
          )}
          aria-label={`${item.label}: ${item.display}`}
        >
          <PortalHoverTooltip tooltip={`${item.label}: ${item.display}`}>
            <ProfileLinkIcon kind={item.kind} className="h-4 w-4 shrink-0" />
          </PortalHoverTooltip>
        </a>
      ))}
    </div>
  );
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

function getStandingNetworkPreview(social: ProfileSocialResponse): {
  previewAccounts: StandingAccountSummary[];
  overflowCount: number;
} {
  const seen = new Set<string>();
  const previewAccounts: StandingAccountSummary[] = [];
  for (const account of [
    ...social.mutual,
    ...social.incoming,
    ...social.outgoing,
  ]) {
    if (!seen.has(account.accountId)) {
      seen.add(account.accountId);
      previewAccounts.push(account);
    }
    if (previewAccounts.length >= 5) break;
  }

  const uniqueNetworkCount = Math.max(
    0,
    social.counts.incoming + social.counts.outgoing - social.counts.mutual
  );
  const overflowCount = Math.max(
    0,
    uniqueNetworkCount - previewAccounts.length
  );

  return { previewAccounts, overflowCount };
}

function ProfileStandingNetworkPreview({
  previewAccounts,
  overflowCount,
  isSelf,
  networkHref,
  onOpenNetwork,
  prefetchNetwork,
  className,
}: {
  previewAccounts: StandingAccountSummary[];
  overflowCount: number;
  isSelf: boolean;
  networkHref?: string;
  onOpenNetwork?: () => void;
  prefetchNetwork?: () => void;
  className?: string;
}) {
  if (previewAccounts.length === 0) return null;

  const metricInnerClass = 'inline-flex items-center gap-1';
  const networkControlClass = cn(
    socialMetricBtnClass,
    'group inline-flex shrink-0 items-center gap-1 focus-visible:ring-border/60',
    className
  );
  const content = (
    <span className={metricInnerClass}>
      <span className="flex items-center">
        {previewAccounts.map((account, index) => (
          <AccountAvatar
            key={account.accountId}
            avatarUrl={account.avatarUrl}
            className={cn('h-5 w-5 border-background', index > 0 && '-ml-1.5')}
          />
        ))}
        {overflowCount > 0 ? (
          <span className="pl-1 portal-type-label font-medium tabular-nums text-muted-foreground/55 transition-colors group-hover:text-muted-foreground/70">
            +{formatCount(overflowCount)}
          </span>
        ) : null}
      </span>
      <ProtocolMotionArrow className="h-2.5 w-2.5 text-muted-foreground/55" />
    </span>
  );

  if (networkHref) {
    return (
      <Link
        href={networkHref}
        prefetch
        {...graphRoutePrefetchProps(prefetchNetwork)}
        className={networkControlClass}
        aria-label={
          isSelf ? 'View your standing network' : 'View standing network'
        }
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenNetwork}
      className={networkControlClass}
      aria-label={
        isSelf ? 'View your standing network' : 'View standing network'
      }
    >
      {content}
    </button>
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
}) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open, scrollRef);
  const nearFacts = useProfileNearFacts(accountId, open);
  const lastProfileUpdate = profileDateLabel(profile?.lastUpdatedAt);
  const updatedFieldsLabel =
    latestProfileUpdateFields.length > 0
      ? latestProfileUpdateFields.join(' · ')
      : null;
  const nearLoading = nearFacts.loading;
  const nearAccount = nearFacts.facts?.nearAccount ?? null;
  const nearAccountExplorerUrl = nearFacts.facts?.nearAccountExplorerUrl;
  const nearAccountCreation = nearFacts.facts?.nearAccountCreation ?? null;
  const nearUnavailable = nearFacts.error ? 'Unavailable' : 'Unavailable';
  const accountCreatedLabel = profileDateLabel(
    nearAccountCreation?.blockTimestamp
  );
  const accountCreatedUrl =
    nearAccountCreation?.explorerUrl ?? nearAccountExplorerUrl;
  const accountType = nearLoading ? (
    <ModalFactValueSkeleton wide />
  ) : nearAccount ? (
    nearAccount.codeHash === NEAR_EMPTY_CODE_HASH ? (
      'User account'
    ) : (
      'Contract account'
    )
  ) : (
    nearUnavailable
  );
  const storageUsed = nearLoading ? (
    <ModalFactValueSkeleton />
  ) : nearAccount ? (
    formatBytes(nearAccount.storageUsage)
  ) : (
    nearUnavailable
  );
  const accountCreatedValue = nearLoading ? (
    <ModalFactValueSkeleton wide />
  ) : accountCreatedLabel ? (
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
  ) : null;

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
                    {accountCreatedValue ? (
                      <ModalFactRow
                        dense
                        label="Created"
                        value={accountCreatedValue}
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
    theyStandWithViewer: Boolean(body.theyStandWithViewer),
    mutual: normalizeAccounts(body.mutual),
    counts: {
      incoming: Number(body.counts?.incoming ?? 0),
      outgoing: Number(body.counts?.outgoing ?? 0),
      mutual: Number(body.counts?.mutual ?? 0),
    },
    endorsementCounts: {
      received: Number(body.endorsementCounts?.received ?? 0),
      given: Number(body.endorsementCounts?.given ?? 0),
    },
    incoming: normalizeAccounts(body.incoming),
    outgoing: normalizeAccounts(body.outgoing),
  };
}

function portalProfileShellForAccount(
  shell: PortalProfileShell | null | undefined,
  accountId: string | null
): PortalProfileShell | null {
  if (!shell || !accountId || shell.accountId !== accountId) return null;
  return shell;
}

const MAX_ENDORSEMENTS_PER_TARGET = 5;

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
  onSupportEndorsement,
  onClaimSupportBalance,
  isSupportingProfile = false,
  isClaimingSupportBalance = false,
}: ProfileModalProps) {
  const isPage = variant === 'page';
  const active = Boolean(accountId) && (isPage || open);
  const rallyParticipations = useProfileRallyParticipations(accountId, active);
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const {
    deriveProfileSocialStanding,
    reconcileStandingFromApi,
    shouldFreshFetchProfileSocial,
    standingSyncVersion,
    isStandingPendingForTarget,
  } = useProfile();
  const shellForAccount = portalProfileShellForAccount(initialShell, accountId);
  const { prefetchStand, prefetchEndorsements, prefetchNetwork } =
    useProfileGraphRoutePrefetch(accountId ?? undefined);
  const networkHref =
    isPage && accountId ? getPortalNetworkUrl(accountId) : undefined;
  const [profile, setProfile] = useState<MaterialisedProfile | null>(
    () => shellForAccount?.profile ?? null
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    () => shellForAccount?.avatarUrl ?? null
  );
  const [bannerUrl, setBannerUrl] = useState<string | null>(
    () => shellForAccount?.bannerUrl ?? null
  );
  const [firstProfileTimestamp, setFirstProfileTimestamp] = useState<
    number | null
  >(null);
  const [latestProfileUpdateFields, setLatestProfileUpdateFields] = useState<
    string[]
  >([]);
  const [profileNetwork, setProfileNetwork] =
    useState<PortalProfileResponse['network']>(undefined);
  const [social, setSocial] = useState<ProfileSocialResponse | null>(null);
  const [reputation, setReputation] = useState<ReputationEntry | null>(null);
  const [signalsReady, setSignalsReady] = useState(false);
  const [hasProfileLoaded, setHasProfileLoaded] = useState(() =>
    Boolean(shellForAccount)
  );
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
  const [supportedEndorsementCount, setSupportedEndorsementCount] = useState(0);
  const [viewerEndorsementCount, setViewerEndorsementCount] = useState(0);
  const [endorseModalOpen, setEndorseModalOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [accountFactsOpen, setAccountFactsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [claimableSupportYocto, setClaimableSupportYocto] =
    useState<bigint>(0n);
  const {
    txResult: claimTxResult,
    setTxResult: setClaimTxResult,
    clearTxResult: clearClaimTxResult,
    trackTransaction: trackClaimTransaction,
  } = useNearTransactionFeedback(viewerAccountId);
  const latestSocialLoadRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSelf = Boolean(accountId && viewerAccountId === accountId);
  useBodyScrollLock(!isPage && active, scrollRef);
  const title = displayName(profile, accountId);
  const bio = profile?.bio?.trim();
  const profileLinks = profileLinkItems(profile?.links);
  const joinedLabel = profileSinceLabel(firstProfileTimestamp);
  const canStand = Boolean(accountId && viewerAccountId && !isSelf);
  const canEndorse = Boolean(
    accountId && viewerAccountId && !isSelf && onEndorse
  );
  const canAddEndorsement =
    canEndorse && viewerEndorsementCount < MAX_ENDORSEMENTS_PER_TARGET;
  const viewerHasEndorsed = viewerEndorsementCount > 0;
  const endorseActionLabel = 'Endorse';
  const canSupport = Boolean(
    accountId && viewerAccountId && !isSelf && onSupportProfile
  );
  const canClaimSupport = Boolean(
    isSelf && accountId && onClaimSupportBalance && claimableSupportYocto > 0n
  );
  const { claim: seasonClaim, refresh: refreshSeasonClaim } =
    useProfileSeasonClaim(viewerAccountId, isSelf && active);
  const canClaimSeasonReward = Boolean(
    isSelf && seasonClaim && !seasonClaim.claimed
  );

  useEffect(() => {
    if (!isSelf || !accountId || !active) {
      setSupportedEndorsementCount(0);
      return;
    }

    let cancelled = false;
    void fetchEndorsementSupportGiven(accountId)
      .then((response) => {
        if (!cancelled) setSupportedEndorsementCount(response.total);
      })
      .catch(() => {
        if (!cancelled) setSupportedEndorsementCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, active, isSelf]);
  const presentedSocial = useMemo(
    () =>
      social && accountId
        ? deriveProfileSocialStanding(social, accountId)
        : null,
    [accountId, deriveProfileSocialStanding, social, standingSyncVersion]
  );
  const viewerStanding = Boolean(presentedSocial?.viewerStanding);
  const theyStandWithViewer = Boolean(
    !isSelf && presentedSocial?.theyStandWithViewer
  );
  const standingPending = Boolean(
    pendingStandingAction ||
      (accountId ? isStandingPendingForTarget(accountId) : false)
  );
  const socialReady = Boolean(social || socialError);
  const endorsementsLazy = useLazyInView({
    enabled: active && Boolean(accountId),
  });

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
    return buildNetworkAccountsOrdered(
      social.mutual.map(standingSummaryToNetworkSource),
      social.incoming.map(standingSummaryToNetworkSource),
      social.outgoing.map(standingSummaryToNetworkSource)
    );
  }, [social]);

  const standingNetworkPreview = useMemo(() => {
    if (!presentedSocial) return null;
    return getStandingNetworkPreview(presentedSocial);
  }, [presentedSocial]);

  const refreshSocial = useCallback(
    async (options?: { fresh?: boolean }) => {
      if (!accountId) return;
      const loadId = latestSocialLoadRef.current + 1;
      latestSocialLoadRef.current = loadId;
      setSocialError(null);

      try {
        const result = await fetchProfileSocial(
          accountId,
          viewerAccountId,
          options
        );
        if (latestSocialLoadRef.current !== loadId) return;
        reconcileStandingFromApi(accountId, result.viewerStanding);
        setSocial(result);
      } catch (error) {
        if (latestSocialLoadRef.current !== loadId) return;
        setSocialError(getErrorMessage(error));
      }
    },
    [accountId, reconcileStandingFromApi, viewerAccountId]
  );

  useEffect(() => {
    if (!active || !accountId) {
      latestSocialLoadRef.current += 1;
      return;
    }

    setSocial(null);
    setSocialError(null);
    setReputation(null);
    setSignalsReady(false);
    setEndorsementCount(0);
    setGivenEndorsementCount(0);
    setViewerEndorsementCount(0);
    setEndorseModalOpen(false);
    setNetworkOpen(false);
    setAccountFactsOpen(false);
    setSupportOpen(false);
    setClaimableSupportYocto(0n);
    clearClaimTxResult();
  }, [accountId, active, clearClaimTxResult]);

  const refreshClaimableSupport = useCallback(
    async (options: { fresh?: boolean } = {}) => {
      if (!isSelf || !accountId) {
        setClaimableSupportYocto(0n);
        return;
      }
      try {
        const balance = await fetchProfileSupportBalanceYocto(
          accountId,
          options
        );
        setClaimableSupportYocto(balance);
      } catch {
        setClaimableSupportYocto(0n);
      }
    },
    [accountId, isSelf]
  );

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
        submittedMessage: txToastPending.claimingSupport,
        successMessage: txToastSuccess.supportCollected,
        failureMessage: txToastError.claimSupportFailed,
      });
      if (confirmed) {
        window.setTimeout(
          () => void refreshClaimableSupport({ fresh: true }),
          4_000
        );
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
      setHasProfileLoaded(true);
    } else if (initialShell?.accountId === accountId) {
      setProfile(initialShell.profile);
      setAvatarUrl(initialShell.avatarUrl);
      setBannerUrl(initialShell.bannerUrl);
      setFirstProfileTimestamp(null);
      setLatestProfileUpdateFields([]);
      setProfileNetwork(undefined);
      setHasProfileLoaded(true);
    } else {
      setProfile(null);
      setAvatarUrl(null);
      setBannerUrl(null);
      setFirstProfileTimestamp(null);
      setLatestProfileUpdateFields([]);
      setProfileNetwork(undefined);
      setHasProfileLoaded(false);
    }

    setProfileError(null);
    setSocial(null);
    setSocialError(null);
    setReputation(null);
    setSignalsReady(false);

    void fetchPortalProfileBundle(accountId, viewerAccountId, {
      fresh: shouldFreshFetchProfileSocial(accountId),
    })
      .then((result) => {
        if (cancelled) return;
        setProfile(result.profile);
        setAvatarUrl(result.avatarUrl);
        setBannerUrl(result.bannerUrl);
        setFirstProfileTimestamp(result.firstProfileTimestamp);
        setLatestProfileUpdateFields(result.latestProfileUpdateFields);
        setProfileNetwork(result.network);
        setReputation(result.signals?.reputation ?? null);

        const normalizedSocial = applyProfileSocial(result.social);
        if (normalizedSocial) {
          reconcileStandingFromApi(accountId, normalizedSocial.viewerStanding);
          setSocial(normalizedSocial);
          const presented = deriveProfileSocialStanding(
            normalizedSocial,
            accountId
          );
          setEndorsementCount(presented.endorsementCounts.received);
          setGivenEndorsementCount(presented.endorsementCounts.given);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message = getErrorMessage(error);
        const hasVisibleShell =
          (initialShell?.accountId === accountId && initialShell.profile) ||
          (isSelf && selfProfile);
        if (isProfileRateLimitMessage(message) && hasVisibleShell) {
          return;
        }
        setProfileError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setHasProfileLoaded(true);
          setSignalsReady(true);
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
    deriveProfileSocialStanding,
    reconcileStandingFromApi,
    shouldFreshFetchProfileSocial,
  ]);

  useEffect(() => {
    if (!active || !accountId || !shouldFreshFetchProfileSocial(accountId)) {
      return;
    }

    const timers = [2_000, 5_000].map((delay) =>
      window.setTimeout(() => {
        void refreshSocial({ fresh: true });
      }, delay)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [
    accountId,
    active,
    refreshSocial,
    shouldFreshFetchProfileSocial,
    standingSyncVersion,
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
    if (!accountId || !viewerAccountId || !canStand || standingPending) {
      return;
    }

    const nextStanding = !viewerStanding;

    setActionToast(null);
    setPendingStandingAction(nextStanding ? 'stand' : 'step-back');

    try {
      await onUpdateStanding(accountId, nextStanding, {
        accountId,
        name: title,
        avatarUrl,
        bio: bio ?? null,
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
              <div className={cn('space-y-2', !isPage && 'pr-8')}>
                <div className="flex items-start gap-3.5">
                  <div className={profileIdentityAvatarDockClass}>
                    <AccountAvatar
                      avatarUrl={avatarUrl}
                      className={cn(
                        'rounded-2xl !border-[3px] !border-background shadow-lg',
                        profileIdentityAvatarSizeClass
                      )}
                      placeholderIconClassName="h-6 w-6"
                      placeholderIconStrokeWidth={2.5}
                    />
                  </div>
                  {canSupport ||
                  canClaimSupport ||
                  canClaimSeasonReward ||
                  canStand ||
                  canAddEndorsement ? (
                    <div className={profileIdentityActionsClass}>
                      <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
                        {canClaimSeasonReward && seasonClaim ? (
                          <SeasonClaimInlineAction
                            claim={seasonClaim}
                            variant="profile"
                            onClaimed={() => void refreshSeasonClaim()}
                          />
                        ) : null}
                        {canClaimSupport ? (
                          <button
                            type="button"
                            className={walletMenuActionButtonClass(
                              'claim-ready'
                            )}
                            disabled={isClaimingSupportBalance}
                            onClick={() => void handleClaimSupport()}
                            aria-label={`Claim ${formatSupportBalanceLabel(claimableSupportYocto)} SOCIAL support`}
                          >
                            Claim{' '}
                            {formatSupportBalanceLabel(claimableSupportYocto)}{' '}
                            SOCIAL
                          </button>
                        ) : null}
                        {canSupport ? (
                          <button
                            type="button"
                            className={profileSocialSupportButtonClass()}
                            disabled={isSupportingProfile}
                            onClick={() => setSupportOpen(true)}
                            aria-label={`Support ${title} with SOCIAL`}
                          >
                            <HeartHandshake className="h-3 w-3" />
                            Support
                          </button>
                        ) : null}
                        {canAddEndorsement ? (
                          <button
                            type="button"
                            className={profileSocialEndorseButtonClass()}
                            onClick={() => setEndorseModalOpen(true)}
                            aria-label={`Endorse ${title}`}
                          >
                            <ProtocolMotionArrow className="h-2.5 w-2.5 text-[var(--portal-gold)]/70 group-hover:text-[var(--portal-gold)]" />
                            {endorseActionLabel}
                          </button>
                        ) : null}
                        {canStand ? (
                          standingPending ? (
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
                            <button
                              type="button"
                              className={profileSocialStandingButtonClass(
                                viewerStanding
                              )}
                              disabled={!canStand || standingPending}
                              onClick={handleStanding}
                              aria-label={
                                theyStandWithViewer && !viewerStanding
                                  ? `They stand with you. Stand with ${title}`
                                  : viewerStanding
                                    ? `Step back from ${title}`
                                    : `Stand with ${title}`
                              }
                            >
                              <ProfileSocialStandingToggle
                                active={viewerStanding}
                                hasSocialSession={hasSocialSession}
                              />
                            </button>
                          )
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className={profileIdentityTextClass}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2
                      id="profile-modal-title"
                      className="min-w-0 font-semibold text-foreground portal-type-display"
                    >
                      {title}
                    </h2>
                  </div>
                  <p className="min-w-0 truncate portal-type-body-sm text-muted-foreground/55">
                    @{accountId}
                  </p>
                </div>
              </div>

              {bio ? (
                <p className="portal-type-body leading-relaxed text-muted-foreground">
                  {bio}
                </p>
              ) : null}

              {joinedLabel ||
              rallyParticipations.length > 0 ||
              !socialReady ||
              social ? (
                <div className={profileIdentityMetaRowClass}>
                  {!socialReady ? (
                    <ProfileStandingNetworkSkeleton />
                  ) : standingNetworkPreview &&
                    standingNetworkPreview.previewAccounts.length > 0 ? (
                    <ProfileStandingNetworkPreview
                      previewAccounts={standingNetworkPreview.previewAccounts}
                      overflowCount={standingNetworkPreview.overflowCount}
                      isSelf={isSelf}
                      networkHref={networkHref}
                      onOpenNetwork={
                        networkHref ? undefined : () => setNetworkOpen(true)
                      }
                      prefetchNetwork={prefetchNetwork}
                      className="shrink-0"
                    />
                  ) : null}
                  {joinedLabel &&
                  (!socialReady ||
                    (standingNetworkPreview?.previewAccounts.length ?? 0) >
                      0) ? (
                    <span
                      className="select-none text-muted-foreground/30"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                  ) : null}
                  {joinedLabel ? (
                    <button
                      type="button"
                      onClick={() => setAccountFactsOpen(true)}
                      className={cn(
                        socialMetricBtnClass,
                        'group inline-flex shrink-0 items-center gap-0.5 text-muted-foreground/55 transition-colors hover:text-muted-foreground/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60'
                      )}
                      aria-label={`View account facts for ${title}`}
                    >
                      Joined {joinedLabel}
                      <ProtocolMotionArrow className="h-2 w-2 text-muted-foreground/45" />
                    </button>
                  ) : null}
                  {rallyParticipations.length > 0 &&
                  (joinedLabel ||
                    !socialReady ||
                    (standingNetworkPreview?.previewAccounts.length ?? 0) >
                      0) ? (
                    <span
                      className="select-none text-muted-foreground/30"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                  ) : null}
                  <ProfileRallyCredentials
                    participations={rallyParticipations}
                  />
                </div>
              ) : null}

              <AnimatePresence initial={false} mode="wait">
                {!socialReady || !signalsReady ? (
                  <motion.div
                    key="profile-signals-skeleton"
                    {...fadeMotion(reduceMotion ? 0 : 0.12)}
                  >
                    <ProfileSignalsBandSkeleton />
                  </motion.div>
                ) : presentedSocial ? (
                  <motion.div
                    key="profile-signals-band"
                    {...fadeMotion(reduceMotion ? 0 : 0.12)}
                  >
                    <ProfileSignalsBand
                      social={presentedSocial}
                      endorsementCount={endorsementCount}
                      givenEndorsementCount={givenEndorsementCount}
                      supportedEndorsementCount={supportedEndorsementCount}
                      reputation={reputation}
                      isSelf={isSelf}
                      viewerHasEndorsed={viewerHasEndorsed}
                      footer={
                        profileLinks.length > 0 ? (
                          <ProfileSocialLinkIcons links={profileLinks} />
                        ) : undefined
                      }
                      showEndorsementMetrics={
                        endorsementCount > 0 ||
                        givenEndorsementCount > 0 ||
                        viewerHasEndorsed ||
                        isSelf ||
                        canAddEndorsement
                      }
                      onOpenStanceDetail={openStanceDetailPage}
                      onOpenEndorsements={openEndorsementsPage}
                      prefetchStandDetail={prefetchStand}
                      prefetchEndorsementsPage={prefetchEndorsements}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div ref={endorsementsLazy.ref} className="min-h-px">
                {endorsementsLazy.inView ? (
                  <ProfileEndorsements
                    accountId={accountId}
                    viewerAccountId={viewerAccountId}
                    targetDisplayName={title}
                    targetAvatarUrl={avatarUrl}
                    selfAvatarUrl={selfAvatarUrl}
                    hasSocialSession={hasSocialSession}
                    onEndorse={onEndorse}
                    onRemoveEndorsement={onRemoveEndorsement}
                    onSupportEndorsement={onSupportEndorsement}
                    pageLayout={isPage}
                    onSelectAccount={isPage ? undefined : onSelectAccount}
                    onEndorsementCountChange={setEndorsementCount}
                    onGivenCountChange={setGivenEndorsementCount}
                    hideEndorseAction
                    endorseModalOpen={endorseModalOpen}
                    onEndorseModalOpenChange={setEndorseModalOpen}
                    onViewerEndorsementCountChange={setViewerEndorsementCount}
                  />
                ) : null}
              </div>
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
        {!isPage ? (
          <NetworkModal
            open={networkOpen}
            centerAccountId={accountId}
            centerAvatarUrl={avatarUrl}
            centerDisplayName={title}
            accounts={networkAccounts}
            totalCounts={presentedSocial?.counts}
            viewerAccountId={viewerAccountId}
            isSelf={isSelf}
            onClose={() => setNetworkOpen(false)}
            onSelectAccount={(id) => {
              setNetworkOpen(false);
              onSelectAccount?.(id);
            }}
          />
        ) : null}
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
    <TransactionFeedbackToast
      result={claimTxResult ?? actionToast}
      onClose={() => {
        if (claimTxResult) {
          clearClaimTxResult();
          return;
        }
        setActionToast(null);
      }}
    />
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
