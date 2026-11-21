import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../src/scripts/apply-hasura-permissions.ts'
  ),
  'utf8'
);

describe('refreshTrackedFunctions', () => {
  it('checks per-op retrack results and restores function permissions immediately', () => {
    const start = src.indexOf('async function refreshTrackedFunctions');
    const end = src.indexOf('async function createFunctionPermissions');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toContain('unexpectedErrors++');
    expect(body).toContain("op.type === 'pg_track_function'");
    expect(body).toContain(
      'await createFunctionPermissions({ allowMissingTableSelect: true })'
    );
  });

  it('sync retracks functions before the long table permission sync', () => {
    const sync = src.slice(
      src.indexOf("case 'sync':"),
      src.indexOf("case 'smoke':")
    );
    expect(sync.indexOf('await refreshTrackedFunctions()')).toBeLessThan(
      sync.indexOf('await syncPermissions()')
    );
  });
});
