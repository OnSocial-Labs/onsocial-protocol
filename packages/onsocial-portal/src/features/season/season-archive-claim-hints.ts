import type { SeasonZeroClaimRecord } from '@/features/season/season-zero-types';
import { seasonApiPath } from '@/lib/active-season';
import {
  resolveSeasonPhaseLabel,
  type SeasonRegistryEntry,
} from '@/lib/season-registry';
import { cn } from '@/lib/utils';

export type ArchiveSeasonClaimHint = 'collect' | 'collected' | 'none';

export type ArchiveSeasonBadgeTone = 'muted' | 'gold' | 'subtle' | 'loading';

export interface ArchiveSeasonBadgeCopy {
  label: string;
  tone: ArchiveSeasonBadgeTone;
}

export function resolveArchiveSeasonClaimHint(
  claim: SeasonZeroClaimRecord | null | undefined
): ArchiveSeasonClaimHint {
  if (!claim || BigInt(claim.amountYocto || '0') <= 0n) {
    return 'none';
  }
  if (claim.claimed) {
    return 'collected';
  }
  return 'collect';
}

export async function fetchArchiveSeasonClaimHint(
  accountId: string,
  seasonId: string
): Promise<ArchiveSeasonClaimHint> {
  const response = await fetch(
    seasonApiPath(seasonId, `claims/${encodeURIComponent(accountId)}`),
    { cache: 'no-store' }
  );
  if (!response.ok) {
    return 'none';
  }

  const data = (await response.json()) as {
    claim?: SeasonZeroClaimRecord | null;
  };
  return resolveArchiveSeasonClaimHint(data.claim ?? null);
}

export function resolveArchiveSeasonBadge({
  entry,
  hint,
  hintsReady,
  walletConnected,
}: {
  entry: SeasonRegistryEntry;
  hint?: ArchiveSeasonClaimHint;
  hintsReady: boolean;
  walletConnected: boolean;
}): ArchiveSeasonBadgeCopy {
  if (!entry.claim_open) {
    return {
      label: resolveSeasonPhaseLabel(entry.phase),
      tone: 'muted',
    };
  }

  if (!hintsReady) {
    return { label: '', tone: 'loading' };
  }

  if (!walletConnected) {
    return { label: 'Claims open', tone: 'muted' };
  }

  if (hint === 'collect') {
    return { label: 'Collect', tone: 'gold' };
  }

  if (hint === 'collected') {
    return { label: 'Collected', tone: 'subtle' };
  }

  return { label: 'Archive', tone: 'muted' };
}

export function archiveSeasonBadgeClassName(
  tone: ArchiveSeasonBadgeTone
): string {
  const base = 'shrink-0 text-[10px] uppercase tracking-[0.14em]';

  switch (tone) {
    case 'gold':
      return cn(`${base} portal-gold-text font-semibold`);
    case 'subtle':
      return cn(`${base} text-muted-foreground/70`);
    case 'loading':
      return cn(
        `${base} h-3 w-14 animate-pulse rounded-full bg-foreground/[0.06]`
      );
    default:
      return cn(`${base} text-muted-foreground`);
  }
}
