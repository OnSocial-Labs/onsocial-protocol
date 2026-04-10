import { yoctoToSocial } from '@/lib/near-rpc';

// ---------------------------------------------------------------------------
// Types — match Hasura camelCase column names
// ---------------------------------------------------------------------------

export interface BoosterEntry {
  accountId: string;
  lockedAmount: string;
  effectiveBoost: string;
  lockMonths: number;
  totalClaimed?: string;
  totalCreditsPurchased?: string;
  lastEventType?: string;
  lastEventBlock?: number;
}

export interface EarnerEntry {
  accountId: string;
  totalEarned: string;
  totalClaimed?: string;
  lastCreditBlock?: number;
}

export interface CompositeEntry {
  accountId: string;
  effectiveBoost: string;
  totalEarned: string;
  lockMonths: number;
  score: number;
}

export interface CompactLeaderboard {
  influence: Pick<
    BoosterEntry,
    'accountId' | 'effectiveBoost' | 'lockMonths'
  >[];
  earners: Pick<EarnerEntry, 'accountId' | 'totalEarned'>[];
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchLeaderboard<T>(
  scope: string,
  limit?: number
): Promise<T | null> {
  const params = new URLSearchParams({ scope });
  if (limit != null) params.set('limit', String(limit));

  try {
    const res = await fetch(`/api/leaderboard?${params.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchInfluenceBoard(
  limit = 20
): Promise<{ boosterState: BoosterEntry[] } | null> {
  return fetchLeaderboard('influence', limit);
}

export function fetchCommitmentBoard(
  limit = 20
): Promise<{ boosterState: BoosterEntry[] } | null> {
  return fetchLeaderboard('commitment', limit);
}

export function fetchEarnerBoard(
  limit = 20
): Promise<{ earners: EarnerEntry[] } | null> {
  return fetchLeaderboard('earners', limit);
}

export function fetchCompositeBoard(
  limit = 20
): Promise<{ composite: CompositeEntry[] } | null> {
  return fetchLeaderboard('composite', limit);
}

export function fetchCompactBoard(): Promise<CompactLeaderboard | null> {
  return fetchLeaderboard('compact');
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatSocialCompact(yocto: string): string {
  const raw = Number.parseFloat(yoctoToSocial(yocto));
  if (!Number.isFinite(raw) || raw === 0) return '0';

  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(1)}M`;
  if (raw >= 10_000) return `${(raw / 1_000).toFixed(1)}K`;
  if (raw >= 1_000)
    return raw.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return raw.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function truncateAccountId(id: string, max = 20): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 4)}…${id.slice(-4)}`;
}

export function commitmentLabel(months: number): string {
  if (months >= 48) return 'Citadel';
  if (months >= 24) return 'Vanguard';
  if (months >= 12) return 'Anchor';
  if (months >= 6) return 'Steady';
  if (months >= 1) return 'Scout';
  return 'Observer';
}

export function commitmentAccent(
  months: number
): 'amber' | 'purple' | 'blue' | 'green' | 'slate' {
  if (months >= 48) return 'amber';
  if (months >= 24) return 'purple';
  if (months >= 12) return 'blue';
  if (months >= 6) return 'green';
  return 'slate';
}

export function formatCompositeScore(score: number): string {
  return score.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
