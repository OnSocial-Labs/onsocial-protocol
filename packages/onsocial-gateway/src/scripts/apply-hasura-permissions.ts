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

async function dropSelectPermission(
  tableName: string,
  role: string,
  ignoreMissing = false
): Promise<boolean> {
  try {
    await hasuraMetadata({
      type: 'pg_drop_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: tableName },
        role,
      },
    });
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ignoreMissing && msg.includes('does not exist')) {
      return false;
    }
    throw e;
  }
}

async function trackTables(): Promise<void> {
  console.log('📌 Tracking tables in Hasura...\n');

  const allTableNames = [...TABLES.map((t) => t.name), ...ADMIN_ONLY_TABLES];

  let tracked = 0;
  let skipped = 0;

  for (const name of allTableNames) {
    try {
      await hasuraMetadata({
        type: 'pg_track_table',
        args: {
          source: 'default',
          table: { schema: 'public', name },
        },
      });
      console.log(`   ✓ Tracked ${name}`);
      tracked++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('already tracked') ||
        msg.includes('already-tracked') ||
        msg.includes('already-exists')
      ) {
        console.log(`   ⏭ ${name} (already tracked)`);
        skipped++;
      } else if (msg.includes('does not exist') || msg.includes('not found')) {
        console.log(`   ⚠ ${name} (table not in database yet)`);
        skipped++;
      } else {
        console.error(`   ✗ ${name}: ${msg}`);
      }
    }
  }

  console.log(`\n✅ Tracked ${tracked} tables (${skipped} skipped)\n`);
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
  console.log('🗑️  Dropping existing permissions...\n');

  const roles = Object.keys(TIERS);
  let dropped = 0;

  for (const role of roles) {
    for (const table of TABLES) {
      try {
        await dropSelectPermission(table.name, role);
        console.log(`   ✓ Dropped ${role} permission on ${table.name}`);
        dropped++;
      } catch (e: unknown) {
        // Permission might not exist, that's OK
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('does not exist')) {
          console.log(`   ⚠ ${role}@${table.name}: ${msg}`);
        }
      }
    }
  }

  console.log(`\n✅ Dropped ${dropped} permissions`);
}

async function createPermissions(): Promise<void> {
  console.log('🔧 Creating tier-based permissions...\n');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [role, limits] of Object.entries(TIERS)) {
    console.log(
      `\n📊 Role: ${role} (limit: ${limits.limit}, aggregations: ${limits.allow_aggregations})`
    );

    for (const table of TABLES) {
      try {
        await hasuraMetadata({
          type: 'pg_create_select_permission',
          args: {
            source: 'default',
            table: { schema: 'public', name: table.name },
            role,
            permission: {
              columns: table.columns,
              filter: {}, // No row filter (blockchain data is public)
              limit: limits.limit,
              allow_aggregations: limits.allow_aggregations,
            },
          },
        });
        console.log(`   ✓ Created permission on ${table.name}`);
        created++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes('already defined') ||
          msg.includes('already-exists') ||
          msg.includes('already exists')
        ) {
          await dropSelectPermission(table.name, role);
          await hasuraMetadata({
            type: 'pg_create_select_permission',
            args: {
              source: 'default',
              table: { schema: 'public', name: table.name },
              role,
              permission: {
                columns: table.columns,
                filter: {},
                limit: limits.limit,
                allow_aggregations: limits.allow_aggregations,
              },
            },
          });
          console.log(`   ↻ Replaced permission on ${table.name}`);
          updated++;
        } else if (msg.includes('table') && msg.includes('does not exist')) {
          console.log(
            `   ⚠ ${table.name} (table not found - might not be tracked yet)`
          );
          skipped++;
        } else {
          console.error(`   ✗ ${table.name}: ${msg}`);
        }
      }
    }
  }

  console.log(
    `\n✅ Created ${created} permissions (${updated} replaced, ${skipped} skipped)`
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
        await dropPermissions();
        await trackTables();
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
