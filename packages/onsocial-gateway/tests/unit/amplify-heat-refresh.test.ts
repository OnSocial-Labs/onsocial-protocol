import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'pg';
import {
  AMPLIFY_HEAT_REFRESH_FN,
  AMPLIFY_HEAT_REFRESH_INTERVAL_MS,
  maybeRefreshAmplifyHeat,
  resetAmplifyHeatRefreshState,
} from '../../src/services/notifications/amplify-heat-refresh.js';

function fakeClient(fnExists: boolean) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('to_regprocedure')) {
      return {
        rows: [{ proc: fnExists ? AMPLIFY_HEAT_REFRESH_FN : null }],
      };
    }
    return { rows: [] };
  });
  return { client: { query } as unknown as Client, query };
}

describe('maybeRefreshAmplifyHeat', () => {
  beforeEach(() => {
    resetAmplifyHeatRefreshState();
  });

  it('rebuilds the heat table when the function exists', async () => {
    const { client, query } = fakeClient(true);
    const result = await maybeRefreshAmplifyHeat(client);
    expect(result).toEqual({ skipped: false, refreshed: true });
    expect(query).toHaveBeenCalledWith(`SELECT ${AMPLIFY_HEAT_REFRESH_FN}()`);
  });

  it('skips quietly when social-spend views are not deployed', async () => {
    const { client, query } = fakeClient(false);
    const result = await maybeRefreshAmplifyHeat(client);
    expect(result).toEqual({ skipped: true, refreshed: false });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('holds the interval between refreshes and honors force', async () => {
    const { client, query } = fakeClient(true);
    const start = new Date('2026-08-23T06:00:00.000Z');

    await maybeRefreshAmplifyHeat(client, { now: start });
    const early = await maybeRefreshAmplifyHeat(client, {
      now: new Date(start.getTime() + AMPLIFY_HEAT_REFRESH_INTERVAL_MS - 1),
    });
    expect(early).toEqual({ skipped: true, refreshed: false });

    const due = await maybeRefreshAmplifyHeat(client, {
      now: new Date(start.getTime() + AMPLIFY_HEAT_REFRESH_INTERVAL_MS + 1),
    });
    expect(due).toEqual({ skipped: false, refreshed: true });

    const forced = await maybeRefreshAmplifyHeat(client, {
      now: new Date(start.getTime() + AMPLIFY_HEAT_REFRESH_INTERVAL_MS + 2),
      force: true,
    });
    expect(forced).toEqual({ skipped: false, refreshed: true });

    const refreshCalls = query.mock.calls.filter(([sql]) =>
      String(sql).startsWith('SELECT refresh_post_amplify_heat')
    );
    expect(refreshCalls).toHaveLength(3);
  });
});
