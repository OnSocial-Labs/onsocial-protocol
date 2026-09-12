import { SOCIAL_SPEND_CONTRACT } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import { formatSocialCompact, yoctoToSocial } from '@/lib/format-social-balance';

export type RallySeasonPhase = 'live' | 'upcoming' | 'claim' | 'archived';

export type RallyLifecyclePhase =
  | 'upcoming'
  | 'live'
  | 'ended_pending_settlement'
  | 'finalized_pending_publish'
  | 'published_claim_soon'
  | 'claim_open';

export type RallyRegistryEntry = {
  seasonId: string;
  label: string;
  phase: RallySeasonPhase;
  is_live: boolean;
  claim_open: boolean;
};

export type RallyRegistrySnapshot = {
  live: RallyRegistryEntry | null;
  upcoming: RallyRegistryEntry | null;
  claim: RallyRegistryEntry | null;
  seasons: RallyRegistryEntry[];
  resolvedActiveSeasonId: string | null;
};

export type RallyOnChainConfig = {
  label: string;
  active: boolean;
  starts_at_ns: string;
  ends_at_ns: string;
  is_live: boolean;
  claim_open: boolean;
};

export type RallySettlementSummary = {
  status: string;
  publishedTxHash: string | null;
};

export type RallyMeritBreakdown = {
  join: number;
  profile: number;
  endorsements: number;
  solidarity: number;
  support: number;
  boost: number;
};

export type RallyStanding = {
  rank: number;
  score: number;
  accountId: string;
  displayName?: string | null;
  breakdown?: RallyMeritBreakdown;
};

export type RallyBoardRow = {
  rank: number;
  score: number;
  accountId: string;
  displayName?: string | null;
  breakdown?: RallyMeritBreakdown;
};

export type RallyClaimRecord = {
  seasonId: string;
  accountId: string;
  amountYocto: string;
  proof: string[];
  rank: number;
  score: number;
  claimed: boolean | null;
};

export type RallyPresentation = {
  seasonId: string;
  pageTitle: string;
};

const SEASON_TITLES: Record<string, RallyPresentation> = {
  'season-zero': {
    seasonId: 'season-zero',
    pageTitle: 'Genesis Rally',
  },
  'season-one': {
    seasonId: 'season-one',
    pageTitle: 'OnSocial Rally',
  },
};

export function rallySeasonApiPath(seasonId: string, suffix = ''): string {
  const base = `/api/seasons/${encodeURIComponent(seasonId)}`;
  return suffix ? `${base}/${suffix}` : base;
}

export function resolveRallyPresentation(
  seasonId: string,
  label?: string | null
): RallyPresentation {
  const catalog = SEASON_TITLES[seasonId];
  return {
    seasonId,
    pageTitle: catalog?.pageTitle ?? label?.trim() ?? 'OnSocial Rally',
  };
}

/** Live join or claim window — the only times Rally shows in the OS. */
export function resolveRallyOccasion(
  registry: RallyRegistrySnapshot | null
): RallyRegistryEntry | null {
  return registry?.live ?? registry?.claim ?? null;
}

export function isRallySettlementPublished(
  settlement: RallySettlementSummary | null | undefined
): boolean {
  return (
    settlement != null &&
    (settlement.status === 'published' || Boolean(settlement.publishedTxHash))
  );
}

export function resolveRallyLifecyclePhase(
  onChain: RallyOnChainConfig | null | undefined,
  settlement: RallySettlementSummary | null | undefined,
  nowMs: number = Date.now()
): RallyLifecyclePhase {
  if (onChain?.is_live) return 'live';

  const nowNs = BigInt(nowMs) * 1_000_000n;
  const startsAtNs = BigInt(onChain?.starts_at_ns ?? '0');
  const endsAtNs = BigInt(onChain?.ends_at_ns ?? '0');

  if (onChain?.active && startsAtNs > 0n && nowNs < startsAtNs && !settlement) {
    return 'upcoming';
  }

  if (
    onChain?.active &&
    startsAtNs > 0n &&
    nowNs >= startsAtNs &&
    (endsAtNs <= 0n || nowNs < endsAtNs) &&
    !settlement &&
    !onChain.claim_open
  ) {
    return 'live';
  }

  if (!settlement) return 'ended_pending_settlement';
  if (!isRallySettlementPublished(settlement)) {
    return 'finalized_pending_publish';
  }
  if (onChain?.claim_open) return 'claim_open';
  return 'published_claim_soon';
}

export function parseJoinRallyMinYocto(value: unknown): bigint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = (value as { min_amount?: unknown }).min_amount;
  const minAmount =
    typeof raw === 'string'
      ? raw.trim()
      : typeof raw === 'number'
        ? String(raw)
        : '';
  if (!/^\d+$/.test(minAmount)) return null;
  try {
    const yocto = BigInt(minAmount);
    return yocto > 0n ? yocto : null;
  } catch {
    return null;
  }
}

export async function fetchJoinRallyMinYocto(): Promise<bigint | null> {
  try {
    const config = await viewNearContract<unknown>(
      SOCIAL_SPEND_CONTRACT,
      'get_action_config',
      { action_id: 'join_rally' }
    );
    return parseJoinRallyMinYocto(config);
  } catch {
    return null;
  }
}

export function formatJoinRallyMinLabel(yocto: bigint): string {
  return yoctoToSocial(yocto.toString());
}

/** Join-min + balance: live connected mark, or a live sheet (guest copy). */
export function shouldFetchRallyJoinAffordance(input: {
  seasonId: string | null;
  live: boolean;
  sheetOpen: boolean;
  accountId: string | null;
}): boolean {
  if (!input.seasonId || !input.live) return false;
  return Boolean(input.accountId) || input.sheetOpen;
}

/** You can pay to join — guests never count. */
export function resolveRallyCanJoin(input: {
  seasonId: string | null;
  accountId: string | null;
  phase: RallyLifecyclePhase | null;
  joined: boolean;
  joinMinYocto: bigint | null;
  hasEnoughSocial: boolean;
}): boolean {
  return (
    Boolean(input.seasonId) &&
    Boolean(input.accountId) &&
    input.phase === 'live' &&
    !input.joined &&
    input.joinMinYocto != null &&
    input.hasEnoughSocial
  );
}

/** Soft wiggle on the two marks only — join or collect, never “season exists”. */
export function resolveRallyMarkNudge(input: {
  visible: boolean;
  canJoin: boolean;
  canCollect: boolean;
}): boolean {
  return input.visible && (input.canJoin || input.canCollect);
}

export function formatRallyRankLabel(
  rank: number | null | undefined
): string {
  if (rank == null || !Number.isFinite(rank) || rank <= 0) return '';
  return `#${rank}`;
}

/** Portfolio / launcher caption — collect amount wins over rank. */
export function formatRallyMarkCaption(input: {
  collectYocto?: string | null;
  rank?: number | null;
}): string {
  const collect = input.collectYocto?.trim() ?? '';
  if (collect && /^\d+$/.test(collect)) {
    try {
      if (BigInt(collect) > 0n) return formatSocialCompact(collect);
    } catch {
      // ignore
    }
  }
  return formatRallyRankLabel(input.rank);
}

function parsePositiveYocto(value: string | null | undefined): bigint | null {
  const raw = value?.trim() ?? '';
  if (!raw || !/^\d+$/.test(raw)) return null;
  try {
    const yocto = BigInt(raw);
    return yocto > 0n ? yocto : null;
  } catch {
    return null;
  }
}

/** Prize sub — pool first, then how many are in. Empty when neither is known. */
export function formatRallyPrizeLine(input: {
  poolYocto?: string | null;
  participantCount?: number | null;
}): string {
  const pool = parsePositiveYocto(input.poolYocto);
  const count =
    input.participantCount != null &&
    Number.isFinite(input.participantCount) &&
    input.participantCount > 0
      ? Math.floor(input.participantCount)
      : 0;
  const amount = pool ? formatSocialCompact(pool.toString()) : '';
  if (amount && count > 0) {
    return `${amount} SOCIAL · ${count} in`;
  }
  if (amount) return `${amount} SOCIAL`;
  if (count > 0) return `${count} in`;
  return '';
}

function readPoints(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export function parseRallyMeritBreakdown(
  raw: unknown
): RallyMeritBreakdown | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  return {
    join: readPoints(row.join),
    profile: readPoints(row.profile),
    endorsements: readPoints(row.endorsements),
    solidarity: readPoints(row.solidarity),
    support: readPoints(row.support),
    boost: readPoints(row.boost),
  };
}

/** Activity only — the join ticket is a floor, not the race. */
export function rallyMeritScore(
  breakdown: RallyMeritBreakdown | null | undefined
): number | null {
  if (!breakdown) return null;
  return (
    breakdown.profile +
    breakdown.endorsements +
    breakdown.solidarity +
    breakdown.support +
    breakdown.boost
  );
}

const MERIT_LEVERS = [
  { key: 'solidarity', one: 'Stands', many: 'Stands' },
  { key: 'endorsements', one: 'Endorsements', many: 'Endorsements' },
  { key: 'support', one: 'Support', many: 'Support' },
  { key: 'boost', one: 'Boost', many: 'Boost' },
  { key: 'profile', one: 'Profile', many: 'Profile' },
] as const;

function leverPoints(
  breakdown: RallyMeritBreakdown,
  key: (typeof MERIT_LEVERS)[number]['key']
): number {
  return breakdown[key];
}

/** One line — what is moving you, or what to do. */
export function resolveRallyMeritWhy(
  breakdown: RallyMeritBreakdown | null | undefined,
  ended = false
): string {
  const merit = rallyMeritScore(breakdown) ?? 0;
  if (merit <= 0) {
    return ended
      ? "Activity didn't move this."
      : 'Stand, endorse, and boost to move.';
  }
  const ranked = MERIT_LEVERS.map((lever) => ({
    ...lever,
    points: leverPoints(breakdown!, lever.key),
  }))
    .filter((lever) => lever.points > 0)
    .sort((left, right) => right.points - left.points);
  const lead = ranked[0];
  const next = ranked[1];
  if (!lead) {
    return ended
      ? "Activity didn't move this."
      : 'Stand, endorse, and boost to move.';
  }
  const pair = next && next.points >= lead.points * 0.6;
  if (ended) {
    return pair
      ? `${lead.many} and ${next.many.toLowerCase()} carried you.`
      : `${lead.one} carried you.`;
  }
  if (pair) {
    return `${lead.many} and ${next.many.toLowerCase()} are carrying you.`;
  }
  const plural = lead.key === 'solidarity' || lead.key === 'endorsements';
  return plural
    ? `${lead.one} are carrying you.`
    : `${lead.one} is carrying you.`;
}

function standingToBoardRow(
  row: Pick<
    RallyBoardRow,
    'rank' | 'score' | 'accountId' | 'displayName' | 'breakdown'
  >
): RallyBoardRow | null {
  const accountId = row.accountId.trim();
  if (!accountId || !Number.isFinite(row.rank) || row.rank <= 0) return null;
  const breakdown = row.breakdown ?? null;
  const merit = rallyMeritScore(breakdown);
  return {
    rank: row.rank,
    score: merit ?? (Number.isFinite(row.score) ? row.score : 0),
    accountId,
    ...(row.displayName?.trim()
      ? { displayName: row.displayName.trim() }
      : {}),
    ...(breakdown ? { breakdown } : {}),
  };
}

/**
 * Three-row strip: neighbors around you when joined, else the top.
 * If you placed outside the fetched page, you still close the strip.
 */
export function resolveRallyStandingStrip(input: {
  rows: readonly RallyBoardRow[];
  viewerAccountId?: string | null;
  viewerStanding?: RallyStanding | null;
  limit?: number;
}): RallyBoardRow[] {
  const limit = Math.max(1, input.limit ?? 3);
  const merged = new Map<string, RallyBoardRow>();
  for (const row of input.rows) {
    const next = standingToBoardRow(row);
    if (next) merged.set(next.accountId.toLowerCase(), next);
  }
  const viewerId = input.viewerAccountId?.trim() ?? '';
  if (viewerId && input.viewerStanding) {
    const yours = standingToBoardRow({
      ...input.viewerStanding,
      accountId: viewerId,
    });
    if (yours) merged.set(viewerId.toLowerCase(), yours);
  }
  const ranked = [...merged.values()].sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    return left.accountId.localeCompare(right.accountId);
  });
  if (ranked.length === 0) return [];

  const viewerIndex = viewerId
    ? ranked.findIndex(
        (row) => row.accountId.toLowerCase() === viewerId.toLowerCase()
      )
    : -1;
  if (viewerIndex < 0) return ranked.slice(0, limit);

  const start = Math.min(
    Math.max(0, viewerIndex - Math.floor((limit - 1) / 2)),
    Math.max(0, ranked.length - limit)
  );
  return ranked.slice(start, start + limit);
}

export type RallySheetView = {
  eyebrow: string;
  title: string;
  titleUnit: string | null;
  body: string;
  ariaLabel: string;
};

/** Number-first sheet copy — Boost collect hierarchy, one season name max. */
export function resolveRallySheetView(input: {
  loaded: boolean;
  pageTitle: string;
  phase: RallyLifecyclePhase | null;
  joined: boolean;
  rank?: number | null;
  canCollect: boolean;
  collectYocto?: string | null;
  collected: boolean;
  joinMinLabel?: string | null;
  isConnected: boolean;
}): RallySheetView {
  const eyebrow = 'Rally';
  const pageTitle = input.pageTitle.trim() || 'OnSocial Rally';

  if (!input.loaded) {
    return {
      eyebrow,
      title: '',
      titleUnit: null,
      body: '',
      ariaLabel: 'Loading rally',
    };
  }

  if (input.canCollect) {
    const amount = formatRallyMarkCaption({
      collectYocto: input.collectYocto,
    });
    return {
      eyebrow,
      title: amount || pageTitle,
      titleUnit: amount ? 'SOCIAL' : null,
      body: 'Ready to collect.',
      ariaLabel: amount
        ? `${amount} SOCIAL ready to collect`
        : `${pageTitle} ready to collect`,
    };
  }

  if (input.collected) {
    return {
      eyebrow,
      title: pageTitle,
      titleUnit: null,
      body: 'SOCIAL collected.',
      ariaLabel: `${pageTitle} collected`,
    };
  }

  if (input.joined) {
    const rank = formatRallyRankLabel(input.rank);
    return {
      eyebrow,
      title: rank || pageTitle,
      titleUnit: null,
      body: '',
      ariaLabel: rank ? `${rank} in ${pageTitle}` : `You're in ${pageTitle}`,
    };
  }

  if (input.phase === 'live') {
    const min = input.joinMinLabel?.trim() || '';
    return {
      eyebrow,
      title: 'Join',
      titleUnit: min ? `${min} SOCIAL` : null,
      body: '',
      ariaLabel: min ? `Join ${pageTitle} · ${min} SOCIAL` : `Join ${pageTitle}`,
    };
  }

  if (input.phase === 'claim_open') {
    return {
      eyebrow,
      title: pageTitle,
      titleUnit: null,
      body: input.isConnected
        ? 'Nothing to collect.'
        : 'Connect to collect if you placed.',
      ariaLabel: pageTitle,
    };
  }

  return {
    eyebrow,
    title: pageTitle,
    titleUnit: null,
    body: `${pageTitle} is closed.`,
    ariaLabel: pageTitle,
  };
}

export async function fetchRallyRegistry(): Promise<RallyRegistrySnapshot | null> {
  const response = await fetch('/api/seasons/registry', { cache: 'no-store' });
  if (!response.ok) return null;
  const data = (await response.json()) as RallyRegistrySnapshot & {
    success?: boolean;
  };
  if (!Array.isArray(data.seasons)) return null;
  return {
    live: data.live ?? null,
    upcoming: data.upcoming ?? null,
    claim: data.claim ?? null,
    seasons: data.seasons,
    resolvedActiveSeasonId:
      data.resolvedActiveSeasonId ?? data.live?.seasonId ?? null,
  };
}

export async function fetchRallyStatus(seasonId: string): Promise<{
  onChainConfig: RallyOnChainConfig | null;
  settlement: RallySettlementSummary | null;
  joinMinYocto: string | null;
  indexedPoolYocto: string | null;
} | null> {
  const response = await fetch(rallySeasonApiPath(seasonId, 'status'), {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    onChainConfig?: RallyOnChainConfig | null;
    settlement?: RallySettlementSummary | null;
    joinMinYocto?: string;
    indexedPoolYocto?: string;
  };
  return {
    onChainConfig: data.onChainConfig ?? null,
    settlement: data.settlement ?? null,
    joinMinYocto: data.joinMinYocto ?? null,
    indexedPoolYocto: data.indexedPoolYocto ?? null,
  };
}

export async function fetchRallyStandings(
  seasonId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ rows: RallyBoardRow[]; total: number } | null> {
  const params = new URLSearchParams();
  params.set('limit', String(opts?.limit ?? 8));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const response = await fetch(
    `${rallySeasonApiPath(seasonId, 'standings')}?${params.toString()}`,
    { cache: 'no-store' }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    total?: number;
    standings?: Array<{
      rank?: number;
      score?: number;
      accountId?: string;
      displayName?: string | null;
      breakdown?: unknown;
    }>;
  };
  const rows = (data.standings ?? [])
    .map((row) =>
      standingToBoardRow({
        rank: Number(row.rank),
        score: Number(row.score),
        accountId: String(row.accountId ?? ''),
        displayName: row.displayName,
        breakdown: parseRallyMeritBreakdown(row.breakdown) ?? undefined,
      })
    )
    .filter((row): row is RallyBoardRow => row != null);
  return {
    rows,
    total: Number.isFinite(data.total) ? Number(data.total) : rows.length,
  };
}

export async function fetchRallyMe(
  seasonId: string,
  accountId: string
): Promise<RallyStanding | null> {
  const response = await fetch(
    `${rallySeasonApiPath(seasonId, 'me')}?account_id=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { standing?: RallyStanding | null };
  const standing = data.standing;
  if (!standing?.accountId) return null;
  const breakdown = parseRallyMeritBreakdown(standing.breakdown);
  return {
    rank: standing.rank,
    score: standing.score,
    accountId: standing.accountId,
    ...(standing.displayName ? { displayName: standing.displayName } : {}),
    ...(breakdown ? { breakdown } : {}),
  };
}

export async function fetchRallyClaim(
  seasonId: string,
  accountId: string
): Promise<RallyClaimRecord | null> {
  const response = await fetch(
    rallySeasonApiPath(seasonId, `claims/${encodeURIComponent(accountId)}`),
    { cache: 'no-store' }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { claim?: RallyClaimRecord | null };
  return data.claim ?? null;
}
