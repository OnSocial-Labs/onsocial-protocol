import { SOCIAL_SPEND_CONTRACT } from '@/lib/app-config';
import { portalHref } from '@/lib/app-links';
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

export type RallyStanding = {
  rank: number;
  score: number;
  accountId: string;
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
  profileBadgeLabel: string;
};

const SEASON_TITLES: Record<string, RallyPresentation> = {
  'season-zero': {
    seasonId: 'season-zero',
    pageTitle: 'Genesis Rally',
    profileBadgeLabel: 'Genesis',
  },
  'season-one': {
    seasonId: 'season-one',
    pageTitle: 'OnSocial Rally',
    profileBadgeLabel: 'Rally',
  },
};

export function rallySeasonApiPath(seasonId: string, suffix = ''): string {
  const base = `/api/seasons/${encodeURIComponent(seasonId)}`;
  return suffix ? `${base}/${suffix}` : base;
}

export function rallyPortalPath(seasonId: string): string {
  return portalHref(`/season/${encodeURIComponent(seasonId)}`);
}

export function resolveRallyPresentation(
  seasonId: string,
  label?: string | null
): RallyPresentation {
  const catalog = SEASON_TITLES[seasonId];
  return {
    seasonId,
    pageTitle: catalog?.pageTitle ?? label?.trim() ?? 'OnSocial Rally',
    profileBadgeLabel: catalog?.profileBadgeLabel ?? 'Rally',
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
      body: pageTitle,
      ariaLabel: rank ? `${rank} in ${pageTitle}` : `You're in ${pageTitle}`,
    };
  }

  if (input.phase === 'live') {
    const min = input.joinMinLabel?.trim() || '';
    return {
      eyebrow,
      title: 'Join',
      titleUnit: min ? `${min} SOCIAL` : null,
      body: min
        ? `Spend ${min} SOCIAL to enter ${pageTitle}.`
        : `Join ${pageTitle}.`,
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
} | null> {
  const response = await fetch(rallySeasonApiPath(seasonId, 'status'), {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    onChainConfig?: RallyOnChainConfig | null;
    settlement?: RallySettlementSummary | null;
    joinMinYocto?: string;
  };
  return {
    onChainConfig: data.onChainConfig ?? null,
    settlement: data.settlement ?? null,
    joinMinYocto: data.joinMinYocto ?? null,
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
  return data.standing ?? null;
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
