/**
 * Hasura Permission Configuration for Production
 *
 * This file generates the metadata for Hasura role-based permissions.
 * Apply using: POST /v1/metadata with the generated JSON
 *
 * Tiers:
 * - free:  Basic queries, 100 row limit, no aggregations
 * - pro:   Full access, 10000 row limit, aggregations allowed
 */

export interface PermissionConfig {
  role: string;
  table: string;
  select: {
    columns: string[] | '*';
    filter: Record<string, any>;
    limit: number;
    allow_aggregations: boolean;
  };
}

// Tables indexed by substreams
const TABLES = [
  'dataUpdates',
  'groupUpdates',
  'storageUpdates',
  'permissionUpdates',
  'contractUpdates',
  'cursors',
];

// Common columns for each table (adjust based on actual schema)
const TABLE_COLUMNS: Record<string, string[]> = {
  dataUpdates: ['id', 'account_id', 'key', 'value', 'block_height', 'timestamp', 'transaction_hash'],
  groupUpdates: ['id', 'group_id', 'account_id', 'action', 'block_height', 'timestamp', 'transaction_hash'],
  storageUpdates: ['id', 'account_id', 'key', 'value_cid', 'block_height', 'timestamp', 'transaction_hash'],
  permissionUpdates: ['id', 'granter', 'grantee', 'permission', 'key_pattern', 'block_height', 'timestamp'],
  contractUpdates: ['id', 'contract_id', 'method', 'args', 'block_height', 'timestamp'],
  cursors: ['id', 'cursor', 'block_num', 'block_id'],
};

/**
 * Generate select permission for a role and table
 */
function generateSelectPermission(
  role: 'free' | 'pro',
  table: string
): object {
  const limits = {
    free: { limit: 100, allow_aggregations: false },
    pro: { limit: 10000, allow_aggregations: true },
  };

  const cfg = limits[role];
  const columns = TABLE_COLUMNS[table] || ['*'];

  return {
    type: 'pg_create_select_permission',
    args: {
      source: 'default',
      table: {
        schema: 'public',
        name: table,
      },
      role,
      permission: {
        columns: columns,
        filter: {}, // No row-level filtering (blockchain is public)
        limit: cfg.limit,
        allow_aggregations: cfg.allow_aggregations,
      },
    },
  };
}

/**
 * Generate all permissions for Hasura metadata API
 */
export function generateHasuraPermissions(): object {
  const permissions: object[] = [];

  const roles: ('free' | 'pro')[] = ['free', 'pro'];

  for (const role of roles) {
    for (const table of TABLES) {
      permissions.push(generateSelectPermission(role, table));
    }
  }

  return {
    type: 'bulk',
    args: permissions,
  };
}

/**
 * Generate drop permissions (for cleanup/reset)
 */
export function generateDropPermissions(): object {
  const drops: object[] = [];

  const roles = ['free', 'pro'];

  for (const role of roles) {
    for (const table of TABLES) {
      drops.push({
        type: 'pg_drop_select_permission',
        args: {
          source: 'default',
          table: {
            schema: 'public',
            name: table,
          },
          role,
        },
      });
    }
  }

  return {
    type: 'bulk',
    args: drops,
  };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const action = process.argv[2] || 'create';

  if (action === 'drop') {
    console.log(JSON.stringify(generateDropPermissions(), null, 2));
  } else {
    console.log(JSON.stringify(generateHasuraPermissions(), null, 2));
  }
}
