'use client';

import { User } from 'lucide-react';
import type { ReactNode } from 'react';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { profileSocialStandingButtonClass } from '@/components/ui/profile-action-pill';
import {
  ProfileSocialStandingPending,
  ProfileSocialStandingToggle,
} from '@/components/ui/profile-social-standing-toggle';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { RelationshipSignal } from '@/components/ui/relationship-signal';
import { profileListResultRowClass } from '@/features/profile/profile-list-row';
import { cleanHandle } from '@/lib/endorsements';
import {
  formatProfileCount,
  type StandingAccountSummary,
} from '@/lib/profile-social-standings';
import { ProfileGraphRowLink } from '@/lib/profile-graph-link';
import { cn } from '@/lib/utils';

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
        <User className="h-4 w-4" strokeWidth={2} />
      )}
    </div>
  );
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

export function StandingList({
  accounts,
  emptyLabel,
  emptyCta,
  viewerAccountId,
  hasSocialSession = false,
  pendingStandingIds,
  onSelectAccount,
  onUpdateStanding,
  layout = 'modal',
  pageLayout = layout === 'page',
}: {
  accounts: StandingAccountSummary[];
  emptyLabel: string;
  emptyCta?: ReactNode;
  viewerAccountId: string | null;
  hasSocialSession?: boolean;
  pendingStandingIds?: Set<string>;
  onSelectAccount?: (accountId: string) => void;
  onUpdateStanding?: (
    account: StandingAccountSummary,
    shouldStand: boolean
  ) => Promise<void>;
  layout?: 'modal' | 'page';
  /** When true, rows link to profile pages (page layout default). */
  pageLayout?: boolean;
}) {
  if (accounts.length === 0) {
    return <EmptyState cta={emptyCta}>{emptyLabel}</EmptyState>;
  }

  const listClass =
    layout === 'page' ? 'space-y-1' : 'divide-y divide-fade-item';

  return (
    <div className={listClass}>
      {accounts.map((account) => {
        const canUpdateStanding =
          Boolean(viewerAccountId) &&
          viewerAccountId !== account.accountId &&
          Boolean(onUpdateStanding);
        const isRowPending =
          pendingStandingIds?.has(account.accountId) ?? false;
        const viewerStandsWithAccount = Boolean(account.viewerStanding);
        const canShowViewerRelationship =
          Boolean(viewerAccountId) && viewerAccountId !== account.accountId;
        const theyStandWithViewer =
          canShowViewerRelationship && Boolean(account.theyStandWithViewer);
        const sharedSolidarity = viewerStandsWithAccount && theyStandWithViewer;
        const bio = account.bio?.trim();
        const timeMeta = standingTimeMeta(account);
        return (
          <div key={account.accountId} className={profileListResultRowClass}>
            <ProfileGraphRowLink
              accountId={account.accountId}
              pageLayout={pageLayout}
              onNavigate={onSelectAccount}
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
                <span className="block truncate portal-type-lead font-medium text-foreground">
                  {accountLabel(account)}
                </span>
                <span className="block truncate portal-type-body-sm text-muted-foreground/55">
                  @{account.accountId}
                </span>
                {bio ? (
                  <span className="mt-0.5 block truncate portal-type-body-sm text-muted-foreground/60">
                    {bio}
                  </span>
                ) : null}
                <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 portal-type-label text-muted-foreground/65">
                  <PortalHoverTooltip
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    aria-label={`${formatProfileCount(account.standingCount ?? 0)} stand with them`}
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
                      {formatProfileCount(account.standingCount ?? 0)}
                    </span>
                  </PortalHoverTooltip>
                  <PortalHoverTooltip
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    aria-label={`They stand with ${formatProfileCount(account.standingWithCount ?? 0)}`}
                    stopPropagation
                    tooltip="They stand with"
                  >
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-[var(--portal-blue)]/85',
                        (account.standingWithCount ?? 0) === 0 && 'opacity-40'
                      )}
                    >
                      {formatProfileCount(account.standingWithCount ?? 0)}
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
                    aria-label={`${formatProfileCount(account.mutualStandingCount ?? 0)} solidarity connections`}
                    stopPropagation
                    tooltip="Solidarity"
                  >
                    <ProtocolMotionArrow
                      direction="in"
                      static
                      className="h-2.5 w-2.5 text-[var(--portal-purple)]/65"
                    />
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-[var(--portal-purple)]/85',
                        (account.mutualStandingCount ?? 0) === 0 && 'opacity-40'
                      )}
                    >
                      {formatProfileCount(account.mutualStandingCount ?? 0)}
                    </span>
                    <ProtocolMotionArrow
                      static
                      className="h-2.5 w-2.5 text-[var(--portal-purple)]/65"
                    />
                  </PortalHoverTooltip>
                  <span className="text-muted-foreground/25" aria-hidden="true">
                    ·
                  </span>
                  <PortalHoverTooltip
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    aria-label={`${formatProfileCount(account.endorsementsReceivedCount ?? 0)} endorsements received`}
                    stopPropagation
                    tooltip="Endorsements received"
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
                      {formatProfileCount(
                        account.endorsementsReceivedCount ?? 0
                      )}
                    </span>
                  </PortalHoverTooltip>
                  <PortalHoverTooltip
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                    aria-label={`${formatProfileCount(account.endorsementsGivenCount ?? 0)} endorsements given`}
                    stopPropagation
                    tooltip="Endorsements given"
                  >
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-[var(--portal-gold)]/85',
                        (account.endorsementsGivenCount ?? 0) === 0 &&
                          'opacity-40'
                      )}
                    >
                      {formatProfileCount(account.endorsementsGivenCount ?? 0)}
                    </span>
                    <ProtocolMotionArrow
                      static
                      className="h-2.5 w-2.5 text-[var(--portal-gold)]/65"
                    />
                  </PortalHoverTooltip>
                </span>
              </span>
            </ProfileGraphRowLink>

            <span className="flex shrink-0 flex-col items-end gap-1">
              <PortalHoverTooltip
                className={cn(
                  'text-right portal-type-caption tabular-nums text-muted-foreground/50',
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
                    className={profileSocialStandingButtonClass(
                      viewerStandsWithAccount
                    )}
                    aria-label={
                      viewerStandsWithAccount ? 'Stepping back' : 'Standing'
                    }
                  >
                    <ProfileSocialStandingPending
                      active={viewerStandsWithAccount}
                      hasSocialSession={hasSocialSession}
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isRowPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      void onUpdateStanding?.(
                        account,
                        !viewerStandsWithAccount
                      );
                    }}
                    className={profileSocialStandingButtonClass(
                      viewerStandsWithAccount
                    )}
                    aria-label={
                      viewerStandsWithAccount
                        ? `Step back from ${accountLabel(account)}`
                        : hasSocialSession
                          ? `Stand with ${accountLabel(account)}`
                          : `Authorize and stand with ${accountLabel(account)}`
                    }
                  >
                    <ProfileSocialStandingToggle
                      active={viewerStandsWithAccount}
                      hasSocialSession={hasSocialSession}
                    />
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
