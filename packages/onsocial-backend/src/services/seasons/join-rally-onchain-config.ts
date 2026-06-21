import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import { viewContractRawAt } from '../near.js';

const JOIN_RALLY_CONFIG_CACHE_TTL_MS = 5 * 60_000;

let cachedJoinMinYocto: bigint | null | undefined;
let cachedJoinMinFetchedAt = 0;

export class JoinRallyConfigUnavailableError extends Error {
  constructor(message = 'Join rally action config is unavailable on-chain') {
    super(message);
    this.name = 'JoinRallyConfigUnavailableError';
  }
}

export function parseJoinRallyMinAmountYocto(raw: string): bigint | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const minAmount =
      typeof parsed.min_amount === 'string'
        ? parsed.min_amount.trim()
        : typeof parsed.min_amount === 'number'
          ? String(parsed.min_amount)
          : '';
    if (!/^\d+$/u.test(minAmount)) {
      return null;
    }

    const value = BigInt(minAmount);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

export async function fetchJoinRallyMinAmountYocto(): Promise<bigint | null> {
  try {
    const raw = await viewContractRawAt(
      config.socialSpendContract,
      'get_action_config',
      { action_id: 'join_rally' }
    );
    if (raw === 'null') {
      return null;
    }

    return parseJoinRallyMinAmountYocto(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error: message },
      'Join rally min amount unavailable from chain'
    );
    return null;
  }
}

export async function getJoinRallyMinAmountYocto(): Promise<bigint | null> {
  const now = Date.now();
  if (
    cachedJoinMinYocto !== undefined &&
    now - cachedJoinMinFetchedAt < JOIN_RALLY_CONFIG_CACHE_TTL_MS
  ) {
    return cachedJoinMinYocto;
  }

  const joinMinYocto = await fetchJoinRallyMinAmountYocto();
  cachedJoinMinYocto = joinMinYocto;
  cachedJoinMinFetchedAt = now;
  return joinMinYocto;
}

export async function requireJoinRallyMinAmountYocto(): Promise<bigint> {
  const joinMinYocto = await getJoinRallyMinAmountYocto();
  if (joinMinYocto == null) {
    throw new JoinRallyConfigUnavailableError();
  }

  return joinMinYocto;
}

export async function getJoinRallyMinAmountYoctoString(): Promise<string | null> {
  const joinMinYocto = await getJoinRallyMinAmountYocto();
  return joinMinYocto?.toString() ?? null;
}

/** Test helper — clears cached join min between unit tests. */
export function clearJoinRallyMinAmountCacheForTests(): void {
  cachedJoinMinYocto = undefined;
  cachedJoinMinFetchedAt = 0;
}
