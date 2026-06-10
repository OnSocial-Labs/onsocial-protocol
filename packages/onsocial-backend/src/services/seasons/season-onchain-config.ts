import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import { viewContractRawAt } from '../near.js';
import { assertSeasonId } from './season-registry.js';

export interface SeasonZeroOnChainConfig {
  label: string;
  active: boolean;
  starts_at_ns: string;
  ends_at_ns: string;
  claim_starts_at_ns?: string | null;
  is_live: boolean;
  claim_open: boolean;
}

function extractJsonInteger(raw: string, field: string): string | null {
  const match = raw.match(
    new RegExp(`"${field}"\\s*:\\s*(null|"\\d+"|\\d+)`, 'u')
  );
  if (!match) return null;
  const value = match[1];
  if (!value || value === 'null') return null;
  return value.replace(/"/g, '');
}

export async function getSeasonOnChainConfig(
  seasonId: string
): Promise<SeasonZeroOnChainConfig | null> {
  const id = assertSeasonId(seasonId);
  try {
    const raw = await viewContractRawAt(
      config.socialSpendContract,
      'get_season_config',
      { season_id: id }
    );
    if (raw === 'null') return null;
    const parsed = JSON.parse(raw) as Omit<
      SeasonZeroOnChainConfig,
      'starts_at_ns' | 'ends_at_ns' | 'claim_starts_at_ns'
    >;
    return {
      ...parsed,
      starts_at_ns: extractJsonInteger(raw, 'starts_at_ns') ?? '0',
      ends_at_ns: extractJsonInteger(raw, 'ends_at_ns') ?? '0',
      claim_starts_at_ns: extractJsonInteger(raw, 'claim_starts_at_ns'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error: message, seasonId: id },
      'Season on-chain config unavailable'
    );
    return null;
  }
}

export async function getSeasonZeroOnChainConfig(): Promise<SeasonZeroOnChainConfig | null> {
  return getSeasonOnChainConfig('season-zero');
}

/** Baseline for "new during season" social edges (stands, endorsements). */
export function resolveSeasonSocialBaselineNs(
  config: SeasonZeroOnChainConfig | null
): string | null {
  const startsAt = config?.starts_at_ns?.trim();
  if (!startsAt || startsAt === '0' || !/^\d+$/u.test(startsAt)) {
    return null;
  }
  return startsAt;
}
