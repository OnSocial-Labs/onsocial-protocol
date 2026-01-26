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

import { config } from '../src/config/index.js';

// Tables and their columns (actual Hasura schema - snake_case table names, camelCase columns)
const TABLES = [
  { 
    name: 'data_updates', 
    columns: ['id', 'account_id', 'author', 'block_height', 'block_timestamp', 'data_id', 'data_type', 
              'derived_id', 'derived_type', 'group_id', 'group_path', 'is_group_content', 'operation',
              'parent_author', 'parent_path', 'parent_type', 'partition_id', 'path', 'receipt_id',
              'ref_author', 'ref_authors', 'ref_path', 'ref_type', 'refs', 'target_account', 'value', 'writes'] 
  },
  { 
    name: 'storage_updates', 
    columns: ['id', 'actor_id', 'amount', 'auth_type', 'author', 'block_height', 'block_timestamp',
              'donor', 'group_id', 'new_balance', 'operation', 'partition_id', 'payer', 'payer_id',
              'pool_id', 'pool_key', 'previous_balance', 'reason', 'receipt_id', 'target_id'] 
  },
  { 
    name: 'group_updates', 
    columns: ['id', 'approve', 'author', 'block_height', 'block_timestamp', 'description', 'group_id',
              'level', 'member_id', 'no_votes', 'operation', 'partition_id', 'path', 'proposal_id',
              'proposal_type', 'receipt_id', 'role', 'status', 'total_votes', 'value', 'voter', 'yes_votes'] 
  },
  { 
    name: 'permission_updates', 
    columns: ['id', 'account_id', 'author', 'block_height', 'block_timestamp', 'granted', 'operation',
              'partition_id', 'path', 'permission_key', 'permission_type', 'receipt_id', 'target_path', 'value'] 
  },
  { 
    name: 'contract_updates', 
    columns: ['id', 'actor_id', 'auth_type', 'author', 'block_height', 'block_timestamp', 'derived_id',
              'derived_type', 'operation', 'partition_id', 'path', 'payer_id', 'receipt_id', 'target_id'] 
  },
  { 
    name: 'cursors', 
    columns: ['id', 'cursor', 'block_num', 'block_id'] 
  },
];

const TIERS = {
  free: { limit: 100, allow_aggregations: false },
  staker: { limit: 1000, allow_aggregations: true },
  builder: { limit: 10000, allow_aggregations: true },
};

const HASURA_METADATA_URL = config.hasuraUrl.replace('/v1/graphql', '/v1/metadata');

async function hasuraMetadata(body: object): Promise<any> {
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

async function checkExistingPermissions(): Promise<void> {
  console.log('📋 Checking existing permissions...\n');
  
  const result = await hasuraMetadata({
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
        console.log(`   - ${perm.role}: limit=${perm.permission?.limit || 'none'}, aggregations=${perm.permission?.allow_aggregations || false}`);
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
        await hasuraMetadata({
          type: 'pg_drop_select_permission',
          args: {
            source: 'default',
            table: { schema: 'public', name: table.name },
            role,
          },
        });
        console.log(`   ✓ Dropped ${role} permission on ${table.name}`);
        dropped++;
      } catch (e: any) {
        // Permission might not exist, that's OK
        if (!e.message.includes('does not exist')) {
          console.log(`   ⚠ ${role}@${table.name}: ${e.message}`);
        }
      }
    }
  }
  
  console.log(`\n✅ Dropped ${dropped} permissions`);
}

async function createPermissions(): Promise<void> {
  console.log('🔧 Creating tier-based permissions...\n');
  
  let created = 0;
  let skipped = 0;
  
  for (const [role, limits] of Object.entries(TIERS)) {
    console.log(`\n📊 Role: ${role} (limit: ${limits.limit}, aggregations: ${limits.allow_aggregations})`);
    
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
      } catch (e: any) {
        if (e.message.includes('already exists')) {
          console.log(`   ⏭ ${table.name} (already exists)`);
          skipped++;
        } else if (e.message.includes('table') && e.message.includes('does not exist')) {
          console.log(`   ⚠ ${table.name} (table not found - might not be tracked yet)`);
          skipped++;
        } else {
          console.error(`   ✗ ${table.name}: ${e.message}`);
        }
      }
    }
  }
  
  console.log(`\n✅ Created ${created} permissions (${skipped} skipped)`);
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
        await createPermissions();
        break;
      case 'reset':
        await dropPermissions();
        await createPermissions();
        break;
      default:
        console.error(`Unknown action: ${action}`);
        console.log('Usage: apply-hasura-permissions.ts [check|create|drop|reset]');
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
