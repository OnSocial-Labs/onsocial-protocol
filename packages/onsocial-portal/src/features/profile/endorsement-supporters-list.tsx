'use client';

import { User } from 'lucide-react';
import { RelationshipSignal } from '@/components/ui/relationship-signal';
import {
  profileListBioClass,
  profileListContainerClass,
  profileListResultRowClass,
} from '@/features/profile/profile-list-row';
import { cleanHandle } from '@/lib/endorsements';
import { ProfileGraphRowLink } from '@/lib/profile-graph-link';
import { formatSupportBalanceLabel } from '@/lib/social-spend-profile';
import type { EndorsementSupporterSummary } from '@/lib/social-spend-endorsement';
import { cn } from '@/lib/utils';

function accountLabel(account: EndorsementSupporterSummary): string {
  return account.name?.trim() || cleanHandle(account.accountId);
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const deltaMs = Date.now() - timestamp * 1000;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function SupporterAvatar({
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

export function EndorsementSupportersList({
  supporters,
  pageLayout = true,
  onSelectAccount,
}: {
  supporters: EndorsementSupporterSummary[];
  pageLayout?: boolean;
  onSelectAccount?: (accountId: string) => void;
}) {
  if (supporters.length === 0) {
    return null;
  }

  return (
    <div className={profileListContainerClass}>
      {supporters.map((account) => {
        const sharedSolidarity =
          account.viewerStanding && account.theyStandWithViewer;
        const theyStandWithViewer =
          account.theyStandWithViewer && !sharedSolidarity;
        const amountLabel = formatSupportBalanceLabel(
          BigInt(account.totalAmountYocto)
        );
        const timeLabel = formatRelativeTime(account.latestSupportAt);

        return (
          <div key={account.accountId} className={profileListResultRowClass}>
            <ProfileGraphRowLink
              accountId={account.accountId}
              pageLayout={pageLayout}
              onNavigate={onSelectAccount}
            >
              <SupporterAvatar
                avatarUrl={account.avatarUrl}
                className="mt-0.5 h-9 w-9"
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
                {account.bio ? (
                  <span className={profileListBioClass}>{account.bio}</span>
                ) : null}
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 portal-type-label text-muted-foreground/70">
                  <span className="font-semibold tabular-nums text-[var(--portal-green)]">
                    {amountLabel} SOCIAL
                  </span>
                  {account.spendCount > 1 ? (
                    <span className="text-muted-foreground/45">
                      · {account.spendCount} sends
                    </span>
                  ) : null}
                  {timeLabel ? (
                    <span className="text-muted-foreground/45">
                      · {timeLabel}
                    </span>
                  ) : null}
                </span>
              </span>
            </ProfileGraphRowLink>
          </div>
        );
      })}
    </div>
  );
}
