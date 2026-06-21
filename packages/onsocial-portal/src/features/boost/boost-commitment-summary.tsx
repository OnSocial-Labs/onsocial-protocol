'use client';

import type { ReactNode } from 'react';
import { formatSocialCompact } from '@/lib/leaderboard';
import { cn } from '@/lib/utils';

/** Fixed row height in the commitment summary — keeps layout stable after collect refresh. */
export const BOOST_SUMMARY_NETWORK_ROW_CLASS = 'min-h-4';
export const BOOST_SUMMARY_COLLECTED_ROW_CLASS = 'min-h-5';

function SummarySeparator({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('text-border/80', className)}>
      {' · '}
    </span>
  );
}

function formatUnlockLabel(unlockAtNs: number, canUnlock: boolean): string {
  if (canUnlock || unlockAtNs <= 0) return 'Unlock now';

  const remainingNs = unlockAtNs - Date.now() * 1_000_000;
  if (remainingNs <= 0) return 'Unlock now';

  const unlockDate = new Date(unlockAtNs / 1_000_000);

  const formatted = unlockDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `Unlocks ${formatted}`;
}

function SummaryLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'portal-type-label text-center leading-snug text-muted-foreground',
        className
      )}
    >
      {children}
    </p>
  );
}

function UnlockValue({
  canUnlock,
  label,
}: {
  canUnlock: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        'font-medium',
        canUnlock ? 'portal-gold-text' : 'text-foreground/75'
      )}
    >
      {label}
    </span>
  );
}

function NetworkItemsRow({
  items,
  hidden = false,
}: {
  items: Array<{ label: string; value: string; tone?: 'gold' | 'purple' }>;
  hidden?: boolean;
}) {
  return (
    <SummaryLine
      aria-hidden={hidden}
      className={cn(
        'portal-type-micro leading-relaxed text-muted-foreground/75',
        BOOST_SUMMARY_NETWORK_ROW_CLASS,
        hidden && 'invisible'
      )}
    >
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 ? <span className="text-border/70">{' · '}</span> : null}
          <span className="text-muted-foreground/55">{item.label}</span>{' '}
          <span
            className={cn(
              'font-medium tabular-nums',
              item.tone === 'gold' && 'portal-gold-text',
              item.tone === 'purple' && 'portal-purple-text',
              !item.tone && 'text-foreground/70'
            )}
          >
            {item.value}
          </span>
        </span>
      ))}
    </SummaryLine>
  );
}

const NETWORK_PLACEHOLDER_ITEMS = [
  { label: 'Share', value: '—' },
  { label: 'Rate', value: '—' },
  { label: 'Accruing', value: '—/day' },
] as const;

export function BoostCommitmentSummary({
  lockedYocto,
  influenceYocto,
  unlockAtNs,
  canUnlock,
  networkItems = [],
  collectedYocto,
  reserveCollectedSlot = false,
  reserveNetworkSlot = false,
  className,
}: {
  lockedYocto: string;
  influenceYocto: string;
  unlockAtNs: number;
  canUnlock: boolean;
  networkItems?: Array<{
    label: string;
    value: string;
    tone?: 'gold' | 'purple';
  }>;
  collectedYocto?: string;
  /** Keep collected row height before chain shows rewards_claimed > 0. */
  reserveCollectedSlot?: boolean;
  /** Keep network stats row height while values load or refresh. */
  reserveNetworkSlot?: boolean;
  className?: string;
}) {
  const unlockLabel = formatUnlockLabel(unlockAtNs, canUnlock);
  const showCollected = collectedYocto !== undefined && collectedYocto !== '0';
  const showNetwork = networkItems.length > 0;
  const showCollectedRow = showCollected || reserveCollectedSlot;
  const showNetworkRow = showNetwork || reserveNetworkSlot;

  return (
    <div className={cn('mt-1.5 space-y-1', className)}>
      <SummaryLine className="min-h-[2.5rem] leading-relaxed sm:min-h-0">
        <span>
          <span className="font-mono tabular-nums text-foreground/85">
            {formatSocialCompact(lockedYocto)}
          </span>
          {' locked'}
          <SummarySeparator />
          <span className="portal-green-text font-mono font-semibold tabular-nums">
            {formatSocialCompact(influenceYocto)}
          </span>
          {' influence'}
        </span>
        <span className="mt-1 block sm:mt-0 sm:inline">
          <SummarySeparator className="hidden sm:inline" />
          <UnlockValue canUnlock={canUnlock} label={unlockLabel} />
        </span>
      </SummaryLine>

      {showNetworkRow ? (
        <NetworkItemsRow
          items={showNetwork ? networkItems : [...NETWORK_PLACEHOLDER_ITEMS]}
          hidden={!showNetwork}
        />
      ) : null}

      {showCollectedRow ? (
        <SummaryLine
          aria-hidden={!showCollected}
          className={cn(
            'portal-type-micro text-muted-foreground/65',
            BOOST_SUMMARY_COLLECTED_ROW_CLASS,
            !showCollected && 'invisible'
          )}
        >
          Collected{' '}
          <span className="font-mono font-medium tabular-nums text-foreground/60">
            {showCollected ? formatSocialCompact(collectedYocto!) : '—'}
          </span>
        </SummaryLine>
      ) : null}
    </div>
  );
}

export function BoostCommitmentSummarySkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('mt-1.5 space-y-1', className)}>
      <div className="mx-auto min-h-[2.5rem] w-[min(100%,14rem)] animate-pulse rounded-full bg-foreground/[0.06] sm:min-h-4 sm:w-[min(100%,18rem)]" />
      <div
        className={cn(
          'mx-auto w-[min(100%,14rem)] animate-pulse rounded-full bg-foreground/[0.05]',
          BOOST_SUMMARY_NETWORK_ROW_CLASS
        )}
      />
      <div
        className={cn(
          'mx-auto w-[min(100%,10rem)] animate-pulse rounded-full bg-foreground/[0.05]',
          BOOST_SUMMARY_COLLECTED_ROW_CLASS
        )}
      />
    </div>
  );
}
