import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import { viewContractRawAt } from '../near.js';
import {
  getSeasonOnChainConfig,
  type SeasonZeroOnChainConfig,
} from './season-onchain-config.js';
import { assertSeasonId, normalizeSeasonId } from './season-registry.js';

const MS_TO_NS = 1_000_000n;

/** Legacy ids kept on-chain but hidden from portal season pickers. */
const HIDDEN_SEASON_IDS = new Set(['season0']);

export type SeasonPhase = 'live' | 'upcoming' | 'claim' | 'archived';

export interface SeasonRegistryEntry {
  seasonId: string;
  label: string;
  active: boolean;
  phase: SeasonPhase;
  starts_at_ns: string;
  ends_at_ns: string;
  claim_starts_at_ns: string | null;
  is_live: boolean;
  claim_open: boolean;
  rallyPath: string;
}

export interface SeasonRegistrySnapshot {
  live: SeasonRegistryEntry | null;
  /** Nearest future season (`active` and before `starts_at_ns`). */
  upcoming: SeasonRegistryEntry | null;
  /** Most recent season in claim window. */
  claim: SeasonRegistryEntry | null;
  seasons: SeasonRegistryEntry[];
  /** Homepage promo card: live → upcoming → claim → newest configured. */
  resolvedPromoSeasonId: string | null;
  /** `/season` default route: live → claim → upcoming → newest configured. */
  resolvedActiveSeasonId: string | null;
}

function compareStartsAtDesc(
  left: SeasonRegistryEntry,
  right: SeasonRegistryEntry
): number {
  const leftStarts = BigInt(left.starts_at_ns || '0');
  const rightStarts = BigInt(right.starts_at_ns || '0');
  if (leftStarts === rightStarts) {
    return right.seasonId.localeCompare(left.seasonId);
  }
  return leftStarts > rightStarts ? -1 : 1;
}

function compareStartsAtAsc(
  left: SeasonRegistryEntry,
  right: SeasonRegistryEntry
): number {
  const leftStarts = BigInt(left.starts_at_ns || '0');
  const rightStarts = BigInt(right.starts_at_ns || '0');
  if (leftStarts === rightStarts) {
    return left.seasonId.localeCompare(right.seasonId);
  }
  return leftStarts < rightStarts ? -1 : 1;
}

export function resolveSeasonRegistryPointers(
  entries: SeasonRegistryEntry[]
): Pick<
  SeasonRegistrySnapshot,
  | 'live'
  | 'upcoming'
  | 'claim'
  | 'resolvedPromoSeasonId'
  | 'resolvedActiveSeasonId'
> {
  const liveCandidates = entries.filter((entry) => entry.phase === 'live');
  const live =
    liveCandidates.sort(compareStartsAtDesc)[0] ?? null;

  const upcomingCandidates = entries.filter((entry) => entry.phase === 'upcoming');
  const upcoming =
    upcomingCandidates.sort(compareStartsAtAsc)[0] ?? null;

  const claimCandidates = entries.filter((entry) => entry.phase === 'claim');
  const claim =
    claimCandidates.sort(compareStartsAtDesc)[0] ?? null;

  const resolvedPromoSeasonId =
    live?.seasonId ??
    upcoming?.seasonId ??
    claim?.seasonId ??
    entries[0]?.seasonId ??
    null;

  const resolvedActiveSeasonId =
    live?.seasonId ??
    claim?.seasonId ??
    upcoming?.seasonId ??
    entries[0]?.seasonId ??
    null;

  return {
    live,
    upcoming,
    claim,
    resolvedPromoSeasonId,
    resolvedActiveSeasonId,
  };
}

export function resolveSeasonPhase(
  onChain: SeasonZeroOnChainConfig,
  nowNs: bigint
): SeasonPhase {
  if (!onChain.active) {
    return 'archived';
  }

  const startsAtNs = BigInt(onChain.starts_at_ns || '0');
  const endsAtNs = BigInt(onChain.ends_at_ns || '0');

  if (nowNs < startsAtNs) {
    return 'upcoming';
  }
  if (onChain.is_live) {
    return 'live';
  }
  if (onChain.claim_open || nowNs >= endsAtNs) {
    return 'claim';
  }

  return 'archived';
}

function seasonRallyPath(seasonId: string): string {
  return seasonId === 'season-zero' ? '/season-zero' : `/season/${seasonId}`;
}

function toRegistryEntry(
  seasonId: string,
  onChain: SeasonZeroOnChainConfig,
  nowNs: bigint
): SeasonRegistryEntry {
  return {
    seasonId,
    label: onChain.label,
    active: onChain.active,
    phase: resolveSeasonPhase(onChain, nowNs),
    starts_at_ns: onChain.starts_at_ns,
    ends_at_ns: onChain.ends_at_ns,
    claim_starts_at_ns: onChain.claim_starts_at_ns ?? null,
    is_live: onChain.is_live,
    claim_open: onChain.claim_open,
    rallyPath: seasonRallyPath(seasonId),
  };
}

export async function fetchSeasonIdsFromChain(): Promise<string[]> {
  try {
    const raw = await viewContractRawAt(
      config.socialSpendContract,
      'get_season_ids',
      {}
    );
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map((value) => normalizeSeasonId(value))
      .filter((value): value is string => Boolean(value))
      .filter((seasonId) => !HIDDEN_SEASON_IDS.has(seasonId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Season ids unavailable from chain');
    return [];
  }
}

export async function loadSeasonRegistry(
  nowNs = BigInt(Date.now()) * MS_TO_NS
): Promise<SeasonRegistrySnapshot> {
  const seasonIds = await fetchSeasonIdsFromChain();
  const entries: SeasonRegistryEntry[] = [];

  for (const seasonId of seasonIds) {
    const onChain = await getSeasonOnChainConfig(seasonId);
    if (!onChain) {
      continue;
    }
    entries.push(toRegistryEntry(seasonId, onChain, nowNs));
  }

  entries.sort((left, right) => {
    const leftStarts = BigInt(left.starts_at_ns || '0');
    const rightStarts = BigInt(right.starts_at_ns || '0');
    if (leftStarts === rightStarts) {
      return right.seasonId.localeCompare(left.seasonId);
    }
    return leftStarts > rightStarts ? -1 : 1;
  });

  const pointers = resolveSeasonRegistryPointers(entries);
  let {
    live,
    upcoming,
    claim,
    resolvedPromoSeasonId,
    resolvedActiveSeasonId,
  } = pointers;

  const envOverride = config.activeSeasonIdOverride;

  if (envOverride) {
    const overrideEntry = entries.find(
      (entry) => entry.seasonId === envOverride
    );
    if (overrideEntry) {
      resolvedActiveSeasonId = overrideEntry.seasonId;
      resolvedPromoSeasonId = overrideEntry.seasonId;
    } else {
      const overrideConfig = await getSeasonOnChainConfig(envOverride);
      if (overrideConfig) {
        const overrideRegistryEntry = toRegistryEntry(
          envOverride,
          overrideConfig,
          nowNs
        );
        entries.unshift(overrideRegistryEntry);
        resolvedActiveSeasonId = envOverride;
        resolvedPromoSeasonId = envOverride;
        const refreshed = resolveSeasonRegistryPointers(entries);
        live = refreshed.live;
        upcoming = refreshed.upcoming;
        claim = refreshed.claim;
      }
    }
  }

  return {
    live,
    upcoming,
    claim,
    seasons: entries,
    resolvedPromoSeasonId,
    resolvedActiveSeasonId,
  };
}

export async function resolveActiveSeasonId(
  nowNs = BigInt(Date.now()) * MS_TO_NS
): Promise<string> {
  const registry = await loadSeasonRegistry(nowNs);
  const resolved = registry.resolvedActiveSeasonId;
  if (!resolved) {
    throw new Error('No rally season configured on-chain');
  }
  return assertSeasonId(resolved);
}
