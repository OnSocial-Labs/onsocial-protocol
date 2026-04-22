#!/usr/bin/env node
/**
 * Apply Hasura permissions for production gateway
 *
 * Usage:
 *   ./scripts/apply-hasura-permissions.ts [create|drop|check]
 *
 * Environment:
 *   HASURA_URL - Hasura GraphQL endpoint (default: http://localhost:8080)
 *   HASURA_ADMIN_SECRET - Admin secret for Hasura
 */

import { config } from '../config/index.js';
import {
  ADMIN_ONLY_TABLES,
  PUBLIC_TABLES as TABLES,
} from '../config/hasuraPermissionCatalog.js';

// Tiers must match gateway Tier type: 'free' | 'pro' | 'scale' | 'service'
const TIERS = {
  free: { limit: 100, allow_aggregations: true },
  pro: { limit: 1000, allow_aggregations: true },
  scale: { limit: 10000, allow_aggregations: true },
  service: { limit: 10000, allow_aggregations: true },
};

const HASURA_METADATA_URL = config.hasuraUrl.replace(
  '/v1/graphql',
  '/v1/metadata'
);

async function hasuraMetadata(body: object): Promise<unknown> {
  const response = await fetch(HASURA_METADATA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': config.hasuraAdminSecret || '',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Hasura error: ${JSON.stringify(data)}`);
  }

  return data;
}

interface BulkOp {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hasura args are heterogeneous
  args: any;
}

// Send a batch of metadata operations as a single transactional request.
// Hasura performs ONE schema reload for the whole bulk, which avoids the
// schema-reload storm that OOM-killed the container when we issued hundreds
// of independent metadata calls in a loop.
async function hasuraBulk(
  ops: BulkOp[],
  options?: { continueOnError?: boolean }
): Promise<unknown[]> {
  if (ops.length === 0) return [];
  const continueOnError = options?.continueOnError ?? true;
  const type = continueOnError ? 'bulk_keep_going' : 'bulk';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bulk response is an array of per-op results
  const result: any = await hasuraMetadata({ type, args: ops });
  return Array.isArray(result) ? result : [];
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

const BULK_CHUNK_SIZE = 100;

async function fetchTrackedTables(): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- export_metadata response is deeply nested
  const result: any = await hasuraMetadata({
    type: 'export_metadata',
    version: 2,
    args: {},
  });
  const tables = result?.metadata?.sources?.[0]?.tables ?? [];
  const set = new Set<string>();
  for (const t of tables) {
    const name = t?.table?.name;
    if (typeof name === 'string') set.add(name);
  }
  return set;
}

async function trackTables(): Promise<void> {
  console.log('📌 Tracking tables in Hasura...');

  const liveColumns = await fetchLiveColumns().catch(() => new Map());
  const tracked = await fetchTrackedTables();

  const allTableNames = [...TABLES.map((t) => t.name), ...ADMIN_ONLY_TABLES];
  const toTrack = allTableNames.filter(
    (name) => liveColumns.has(name) && !tracked.has(name)
  );
  const missingFromDb = allTableNames.filter((name) => !liveColumns.has(name));
  const alreadyTracked =
    allTableNames.length - toTrack.length - missingFromDb.length;

  if (missingFromDb.length > 0) {
    console.log(
      `   ⚠ ${missingFromDb.length} catalog tables not yet in Postgres: ${missingFromDb.slice(0, 5).join(', ')}${missingFromDb.length > 5 ? ', …' : ''}`
    );
  }

  if (toTrack.length === 0) {
    console.log(`   ✓ All ${alreadyTracked} eligible tables already tracked\n`);
    return;
  }

  const ops: BulkOp[] = toTrack.map((name) => ({
    type: 'pg_track_table',
    args: { source: 'default', table: { schema: 'public', name } },
  }));

  let trackedNow = 0;
  for (const batch of chunk(ops, BULK_CHUNK_SIZE)) {
    const results = await hasuraBulk(batch);
    for (let i = 0; i < batch.length; i++) {
      const r = results[i] as { error?: string; code?: string } | undefined;
      if (r && typeof r === 'object' && 'error' in r && r.error) {
        const msg = String(r.error);
        if (
          msg.includes('already tracked') ||
          msg.includes('already-tracked') ||
          msg.includes('already-exists')
        ) {
          // expected race
        } else {
          console.warn(`   ✗ track ${batch[i].args.table.name}: ${msg}`);
        }
      } else {
        trackedNow++;
      }
    }
  }

  console.log(
    `   ✓ Tracked ${trackedNow} new tables (${alreadyTracked} pre-existing)\n`
  );
}

async function checkExistingPermissions(): Promise<void> {
  console.log('📋 Checking existing permissions...\n');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hasura metadata is deeply nested and untyped
  const result: any = await hasuraMetadata({
    type: 'export_metadata',
    version: 2,
    args: {},
  });

  const tables = result.metadata?.sources?.[0]?.tables || [];

  for (const table of tables) {
    const tableName = table.table?.name;
    const permissions = table.select_permissions || [];

    if (permissions.length > 0) {
      console.log(`📊 ${tableName}:`);
      for (const perm of permissions) {
        console.log(
          `   - ${perm.role}: limit=${perm.permission?.limit || 'none'}, aggregations=${perm.permission?.allow_aggregations || false}`
        );
      }
    }
  }

  console.log('\n✅ Permission check complete');
}

async function dropPermissions(): Promise<void> {
  console.log('🗑️  Dropping existing permissions (bulk)...');

  const roles = Object.keys(TIERS);
  const ops: BulkOp[] = [];
  for (const role of roles) {
    for (const table of TABLES) {
      ops.push({
        type: 'pg_drop_select_permission',
        args: {
          source: 'default',
          table: { schema: 'public', name: table.name },
          role,
        },
      });
    }
  }

  let dropped = 0;
  for (const batch of chunk(ops, BULK_CHUNK_SIZE)) {
    const results = await hasuraBulk(batch);
    for (let i = 0; i < batch.length; i++) {
      const r = results[i] as { error?: string } | undefined;
      if (r && typeof r === 'object' && 'error' in r && r.error) {
        const msg = String(r.error);
        if (!msg.includes('does not exist') && !msg.includes('not found')) {
          console.warn(
            `   ⚠ drop ${batch[i].args.role}@${batch[i].args.table.name}: ${msg}`
          );
        }
      } else {
        dropped++;
      }
    }
  }

  console.log(`   ✓ Dropped ${dropped} permissions\n`);
}

async function fetchLiveColumns(): Promise<Map<string, Set<string>>> {
  // Query the actual Postgres column lists so we only grant permissions for
  // columns that exist (avoids `column not found` errors when the catalog has
  // drifted ahead of the indexer schema, e.g. during a partial deploy).
  const sql = `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- run_sql response is untyped
  const result: any = await hasuraMetadata({
    type: 'run_sql',
    args: { source: 'default', sql, read_only: true },
  });
  const rows: Array<[string, string]> = (result?.result ?? []).slice(1);
  const map = new Map<string, Set<string>>();
  for (const [tableName, columnName] of rows) {
    if (!map.has(tableName)) map.set(tableName, new Set());
    map.get(tableName)!.add(columnName);
  }
  return map;
}

async function createPermissions(): Promise<void> {
  console.log('🔧 Creating tier-based permissions (bulk)...');

  let liveColumns: Map<string, Set<string>>;
  try {
    liveColumns = await fetchLiveColumns();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`   ⚠ Could not introspect Postgres columns: ${msg}`);
    liveColumns = new Map();
  }

  const ops: BulkOp[] = [];
  let skippedMissingTable = 0;
  for (const [role, limits] of Object.entries(TIERS)) {
    for (const table of TABLES) {
      const live = liveColumns.get(table.name);
      if (!live) {
        skippedMissingTable++;
        continue; // Table not in Postgres yet — Hasura would reject.
      }
      const columns = table.columns.filter((c) => live.has(c));
      if (columns.length === 0) continue;
      ops.push({
        type: 'pg_create_select_permission',
        args: {
          source: 'default',
          table: { schema: 'public', name: table.name },
          role,
          permission: {
            columns,
            filter: {}, // No row filter (blockchain data is public)
            limit: limits.limit,
            allow_aggregations: limits.allow_aggregations,
          },
        },
      });
    }
  }

  if (skippedMissingTable > 0) {
    console.log(
      `   ⚠ Skipped ${skippedMissingTable} (role, table) pairs whose tables are not in Postgres yet`
    );
  }

  let created = 0;
  let alreadyExists = 0;
  for (const batch of chunk(ops, BULK_CHUNK_SIZE)) {
    const results = await hasuraBulk(batch);
    for (let i = 0; i < batch.length; i++) {
      const r = results[i] as { error?: string } | undefined;
      if (r && typeof r === 'object' && 'error' in r && r.error) {
        const msg = String(r.error);
        if (
          msg.includes('already defined') ||
          msg.includes('already-exists') ||
          msg.includes('already exists')
        ) {
          alreadyExists++;
        } else {
          console.warn(
            `   ✗ ${batch[i].args.role}@${batch[i].args.table.name}: ${msg}`
          );
        }
      } else {
        created++;
      }
    }
  }

  console.log(
    `   ✓ Created ${created} permissions (${alreadyExists} already existed)\n`
  );
}

async function main(): Promise<void> {
  const action = process.argv[2] || 'create';

  console.log('🚀 Hasura Permission Manager');
  console.log(`   Hasura URL: ${HASURA_METADATA_URL}`);
  console.log(`   Action: ${action}\n`);

  try {
    switch (action) {
      case 'check':
        await checkExistingPermissions();
        break;
      case 'drop':
        await dropPermissions();
        break;
      case 'create':
        await trackTables();
        await createPermissions();
        break;
      case 'reset':
        await trackTables();
        await dropPermissions();
        await createPermissions();
        break;
      default:
        console.error(`Unknown action: ${action}`);
        console.log(
          'Usage: apply-hasura-permissions.ts [check|create|drop|reset]'
        );
        process.exit(1);
    }
  } catch (error: unknown) {
    console.error(
      `\n❌ Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

main();
