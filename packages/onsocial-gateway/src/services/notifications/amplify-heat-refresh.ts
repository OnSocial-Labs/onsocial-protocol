/**
 * Periodic refresh of the `post_amplify_heat_mat` materialized view.
 *
 * Hot feed ordering reads the snapshot instead of recomputing the 14-day
 * decay window per query. The notification worker calls
 * `maybeRefreshAmplifyHeat` on every wake; the interval guard keeps the
 * actual refresh at ~5 minutes (36h half-life ⇒ ≤0.2% decay drift per cycle).
 *
 * `REFRESH ... CONCURRENTLY` needs the unique path index (created with the
 * view) and must run outside a transaction — the worker client is autocommit
 * between batches, which satisfies that.
 */

import type { Client } from 'pg';
import { logger } from '../../logger.js';

export const AMPLIFY_HEAT_MATVIEW = 'post_amplify_heat_mat';
export const AMPLIFY_HEAT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let lastAttemptMs = 0;

/** Test hook — clears the interval guard. */
export function resetAmplifyHeatRefreshState(): void {
  lastAttemptMs = 0;
}

export interface AmplifyHeatRefreshResult {
  /** True when the interval guard or a missing matview short-circuited. */
  skipped: boolean;
  refreshed: boolean;
}

export async function maybeRefreshAmplifyHeat(
  client: Client,
  options: { now?: Date; force?: boolean } = {}
): Promise<AmplifyHeatRefreshResult> {
  const nowMs = (options.now ?? new Date()).getTime();
  if (
    !options.force &&
    nowMs - lastAttemptMs < AMPLIFY_HEAT_REFRESH_INTERVAL_MS
  ) {
    return { skipped: true, refreshed: false };
  }
  lastAttemptMs = nowMs;

  const exists = await client.query<{ regclass: string | null }>(
    'SELECT to_regclass($1) AS regclass',
    [AMPLIFY_HEAT_MATVIEW]
  );
  if (!exists.rows[0]?.regclass) {
    // Social-spend views not deployed on this database — nothing to refresh.
    return { skipped: true, refreshed: false };
  }

  const startedAt = Date.now();
  await client.query(
    `REFRESH MATERIALIZED VIEW CONCURRENTLY ${AMPLIFY_HEAT_MATVIEW}`
  );
  logger.debug(
    { matview: AMPLIFY_HEAT_MATVIEW, durationMs: Date.now() - startedAt },
    'Amplify heat snapshot refreshed'
  );
  return { skipped: false, refreshed: true };
}
