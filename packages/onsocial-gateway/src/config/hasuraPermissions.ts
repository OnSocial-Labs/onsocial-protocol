import { PUBLIC_TABLES } from './hasuraPermissionCatalog.js';

/**
 * Hasura Permission Configuration for Production
 *
 * This file generates the metadata for Hasura role-based permissions.
 * Apply using: POST /v1/metadata with the generated JSON
 *
 * Tiers (must match gateway Tier type: 'free' | 'pro' | 'scale' | 'service'):
 * - free:    Basic queries, 100 row limit, no aggregations
 * - pro:     Extended queries, 1000 row limit, aggregations allowed
 * - scale:   Full access, 10000 row limit, aggregations allowed
 * - service: Internal services (portal, backend), same as scale
 */

export interface PermissionConfig {
  role: string;
  table: string;
  select: {
    columns: string[] | '*';
    filter: Record<string, unknown>;
    limit: number;
    allow_aggregations: boolean;
  };
}

const TABLES = PUBLIC_TABLES.map((table) => table.name);

const TABLE_COLUMNS: Record<string, string[]> = Object.fromEntries(
  PUBLIC_TABLES.map((table) => [table.name, table.columns])
) as Record<string, string[]>;

/**
 * Generate select permission for a role and table
 */
function generateSelectPermission(
  role: 'free' | 'pro' | 'scale' | 'service',
  table: string
): object {
  const limits = {
    free: { limit: 100, allow_aggregations: false },
    pro: { limit: 1000, allow_aggregations: true },
    scale: { limit: 10000, allow_aggregations: true },
    service: { limit: 10000, allow_aggregations: true },
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

  const roles: ('free' | 'pro' | 'scale' | 'service')[] = [
    'free',
    'pro',
    'scale',
    'service',
  ];

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

  const roles = ['free', 'pro', 'scale', 'service'];

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
