import { indexerQuery } from '../../db/indexer.js';
import { assertSeasonId } from './season-registry.js';

interface SeasonJoinEntryRow {
  join_entry_yocto: string | null;
}

export function parseSeasonJoinEntryYocto(
  value: string | null | undefined
): string | null {
  const raw = value?.trim() ?? '';
  if (!/^\d+$/u.test(raw)) {
    return null;
  }

  try {
    return BigInt(raw) > 0n ? raw : null;
  } catch {
    return null;
  }
}

/** Minimum successful join_rally spend indexed for a season (optionally capped at season end). */
export async function getSeasonJoinEntryYocto(
  seasonId: string,
  options: { cutoffTimestampNs?: string } = {}
): Promise<string | null> {
  const id = assertSeasonId(seasonId);
  const cutoff = options.cutoffTimestampNs?.trim();
  const cutoffClause = cutoff ? 'AND block_timestamp <= $2::numeric' : '';
  const params = cutoff ? [id, cutoff] : [id];

  const result = await indexerQuery<SeasonJoinEntryRow>(
    `SELECT MIN(amount::numeric)::text AS join_entry_yocto
     FROM social_spend_events
     WHERE event_type = 'SOCIAL_SPENT'
       AND success = true
       AND action = 'join_rally'
       AND season_id = $1
       AND NULLIF(amount, '') IS NOT NULL
       ${cutoffClause}`,
    params
  );

  return parseSeasonJoinEntryYocto(result.rows[0]?.join_entry_yocto);
}
