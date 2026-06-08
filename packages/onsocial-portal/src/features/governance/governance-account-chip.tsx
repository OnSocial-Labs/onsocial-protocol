'use client';

import Link from 'next/link';
import { User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  prefetchMemberAccountLookups,
  useMemberAccountLookup,
} from '@/hooks/use-member-account-lookup';
import { isNearNamedAccountComplete } from '@/lib/portal-near-account';
import { getPortalProfileUrl } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

export function prefetchGovernanceCardAccounts(
  accountIds: Iterable<string | null | undefined>
): void {
  prefetchMemberAccountLookups(
    [...accountIds].filter((value): value is string => !!value?.trim()),
    { trustedAccount: true }
  );
}

function fallbackDisplayName(accountId: string): string {
  const local = accountId.split('.')[0] ?? accountId;
  if (!local) {
    return accountId;
  }

  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function GovernanceAccountChipSkeleton({
  avatarClassName,
  compact = false,
  dense = false,
  className,
}: {
  avatarClassName?: string;
  compact?: boolean;
  dense?: boolean;
  className?: string;
}) {
  const resolvedAvatarClass =
    avatarClassName ?? (dense ? 'h-6 w-6' : compact ? 'h-5 w-5' : 'h-7 w-7');

  return (
    <div
      aria-hidden="true"
      className={cn(
        'inline-flex w-fit max-w-full min-w-0 items-center gap-2 overflow-hidden',
        className
      )}
    >
      <Skeleton
        className={cn(
          'shrink-0 rounded-full bg-foreground/[0.08]',
          resolvedAvatarClass
        )}
      />
      <span className="flex min-w-0 flex-col gap-1 leading-tight">
        <Skeleton
          className={cn(
            'rounded-full bg-foreground/[0.09]',
            dense || compact ? 'h-3 w-20' : 'h-3.5 w-24'
          )}
        />
        <Skeleton className="h-2.5 w-[4.5rem] rounded-full bg-foreground/[0.06]" />
      </span>
    </div>
  );
}

export function GovernanceAccountChip({
  accountId,
  avatarClassName,
  compact = false,
  dense = false,
  className,
}: {
  accountId: string;
  avatarClassName?: string;
  compact?: boolean;
  dense?: boolean;
  className?: string;
}) {
  const resolvedAvatarClass =
    avatarClassName ?? (dense ? 'h-6 w-6' : compact ? 'h-5 w-5' : 'h-7 w-7');
  const lookup = useMemberAccountLookup(accountId, {
    debounceMs: 0,
    // On-chain voters/proposers are already valid NEAR accounts.
    trustedAccount: true,
  });
  const canLookup = isNearNamedAccountComplete(accountId);
  if (canLookup && lookup.checking) {
    return (
      <GovernanceAccountChipSkeleton
        avatarClassName={avatarClassName}
        compact={compact}
        dense={dense}
        className={className}
      />
    );
  }

  const displayName = lookup.displayName ?? fallbackDisplayName(accountId);

  return (
    <Link
      href={getPortalProfileUrl(accountId)}
      prefetch
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'group/chip inline-flex w-fit max-w-full min-w-0 items-center gap-2 overflow-hidden transition-opacity hover:opacity-90',
        className
      )}
      aria-label={`${displayName} @${accountId}`}
    >
      <span
        className={cn(
          'relative block shrink-0 overflow-hidden rounded-full border border-border/40 bg-muted/30',
          resolvedAvatarClass
        )}
      >
        {lookup.avatarUrl ? (
          <img
            src={lookup.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <User className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn(
            'truncate font-semibold tracking-[-0.01em] text-foreground transition-colors group-hover/chip:text-foreground/80',
            dense || compact ? 'portal-type-body' : 'portal-type-lead'
          )}
        >
          {displayName}
        </span>
        <span className="truncate font-mono portal-type-caption text-muted-foreground/65">
          @{accountId}
        </span>
      </span>
    </Link>
  );
}
