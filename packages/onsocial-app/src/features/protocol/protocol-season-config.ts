export interface ProtocolSeasonConfigDraft {
  seasonId: string;
  label: string;
  active: boolean;
  durationDays: string;
}

export interface ProtocolSeasonConfigInput {
  season_id: string;
  config: {
    label: string;
    active: boolean;
    starts_at_ns: number;
    ends_at_ns: number;
    claim_starts_at_ns: number | null;
  };
}

const SEASON_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const NS_PER_MS = 1_000_000n;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SEASON_WORD_RANKS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
] as const;

export function createDefaultProtocolSeasonConfigDraft(): ProtocolSeasonConfigDraft {
  return {
    seasonId: '',
    label: 'OnSocial Rally',
    active: true,
    durationDays: '7',
  };
}

function unusedSeasonId(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) return candidate;
  let suffix = 2;
  while (taken.has(`${candidate}-${suffix}`)) suffix += 1;
  return `${candidate}-${suffix}`;
}

/** Next unused `season-*` id from on-chain ids (`season-two` → `season-three`). */
export function suggestNextRallySeasonId(
  existingIds: readonly string[]
): string {
  const taken = new Set(
    existingIds.map((id) => id.trim().toLowerCase()).filter(Boolean)
  );

  let bestNumeric = 0;
  let bestWord = -1;
  for (const id of taken) {
    const numeric = /^season-(\d+)$/.exec(id);
    if (numeric) {
      bestNumeric = Math.max(bestNumeric, Number(numeric[1]));
      continue;
    }
    const word = /^season-([a-z]+)$/.exec(id);
    if (!word) continue;
    const rank = SEASON_WORD_RANKS.indexOf(
      word[1] as (typeof SEASON_WORD_RANKS)[number]
    );
    if (rank > bestWord) bestWord = rank;
  }

  if (bestNumeric > 0) {
    return unusedSeasonId(`season-${bestNumeric + 1}`, taken);
  }
  if (bestWord >= 0) {
    const next =
      bestWord + 1 < SEASON_WORD_RANKS.length
        ? `season-${SEASON_WORD_RANKS[bestWord + 1]}`
        : `season-${bestWord + 2}`;
    return unusedSeasonId(next, taken);
  }

  return unusedSeasonId('season-one', taken);
}

export function protocolCreateSeasonConfigReady(
  draft: ProtocolSeasonConfigDraft
): boolean {
  try {
    buildProtocolSeasonConfigInput(draft);
    return true;
  } catch {
    return false;
  }
}

export function durationDaysToMs(input: string): number {
  const trimmed = input.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error('Duration must be greater than zero.');
  }

  const days = Number(trimmed);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('Duration must be greater than zero.');
  }

  return Math.round(days * MS_PER_DAY);
}

export function buildProtocolSeasonConfigInput(
  draft: ProtocolSeasonConfigDraft,
  options: { nowMs?: number } = {}
): ProtocolSeasonConfigInput {
  const seasonId = draft.seasonId.trim().toLowerCase();
  if (!seasonId) {
    throw new Error('Season is required.');
  }
  if (!SEASON_ID_PATTERN.test(seasonId)) {
    throw new Error(
      'Use lowercase letters, numbers, dash, dot, or underscore.'
    );
  }

  const label = draft.label.trim();
  if (!label || label.length > 64 || /[\u0000-\u001F\u007F]/.test(label)) {
    throw new Error('Display name must be 1-64 characters.');
  }

  const nowMs = options.nowMs ?? Date.now();
  const startsAtMs = nowMs + 10 * MS_PER_MINUTE;
  const endsAtMs = startsAtMs + durationDaysToMs(draft.durationDays);

  return {
    season_id: seasonId,
    config: {
      label,
      active: draft.active,
      starts_at_ns: Number(BigInt(startsAtMs) * NS_PER_MS),
      ends_at_ns: Number(BigInt(endsAtMs) * NS_PER_MS),
      claim_starts_at_ns: null,
    },
  };
}
