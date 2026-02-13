/**
 * Hasura Permission Configuration for Production
 *
 * This file generates the metadata for Hasura role-based permissions.
 * Apply using: POST /v1/metadata with the generated JSON
 *
 * Tiers (must match gateway Tier type: 'free' | 'pro' | 'scale'):
 * - free:  Basic queries, 100 row limit, no aggregations
 * - pro:   Extended queries, 1000 row limit, aggregations allowed
 * - scale: Full access, 10000 row limit, aggregations allowed
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

// Tables indexed by substreams (snake_case — must match Postgres)
const TABLES = [
  // Core contract
  'data_updates',
  'storage_updates',
  'group_updates',
  'permission_updates',
  'contract_updates',
  // Token contract (NEP-141)
  'token_events',
  'token_balances',
  // Staking contract
  'staking_events',
  'staker_state',
  'credit_purchases',
  // Substreams cursor
  'cursors',
];

// Columns per table (must match actual Postgres schema)
const TABLE_COLUMNS: Record<string, string[]> = {
  data_updates: ['id', 'account_id', 'author', 'block_height', 'block_timestamp', 'data_id', 'data_type',
    'derived_id', 'derived_type', 'group_id', 'group_path', 'is_group_content', 'operation',
    'parent_author', 'parent_path', 'parent_type', 'partition_id', 'path', 'receipt_id',
    'ref_author', 'ref_authors', 'ref_path', 'ref_type', 'refs', 'target_account', 'value', 'writes'],
  storage_updates: ['id', 'actor_id', 'amount', 'auth_type', 'author', 'block_height', 'block_timestamp',
    'donor', 'group_id', 'new_balance', 'operation', 'partition_id', 'payer', 'payer_id',
    'pool_id', 'pool_key', 'previous_balance', 'reason', 'receipt_id', 'target_id'],
  group_updates: ['id', 'approve', 'author', 'block_height', 'block_timestamp', 'description', 'group_id',
    'level', 'member_id', 'no_votes', 'operation', 'partition_id', 'path', 'proposal_id',
    'proposal_type', 'receipt_id', 'role', 'status', 'total_votes', 'value', 'voter', 'yes_votes'],
  permission_updates: ['id', 'account_id', 'author', 'block_height', 'block_timestamp', 'granted', 'operation',
    'partition_id', 'path', 'permission_key', 'permission_type', 'receipt_id', 'target_path', 'value'],
  contract_updates: ['id', 'actor_id', 'auth_type', 'author', 'block_height', 'block_timestamp', 'derived_id',
    'derived_type', 'operation', 'partition_id', 'path', 'payer_id', 'receipt_id', 'target_id'],
  token_events: ['id', 'block_height', 'block_timestamp', 'receipt_id', 'event_type',
    'owner_id', 'amount', 'memo', 'old_owner_id', 'new_owner_id'],
  token_balances: ['account_id', 'last_event_type', 'last_event_block', 'updated_at'],
  staking_events: ['id', 'block_height', 'block_timestamp', 'receipt_id', 'account_id', 'event_type',
    'success', 'amount', 'effective_stake', 'months', 'new_months', 'new_effective',
    'elapsed_ns', 'total_released', 'remaining_pool', 'infra_share', 'rewards_share',
    'total_pool', 'receiver_id', 'old_owner', 'new_owner', 'old_version', 'new_version', 'deposit'],
  staker_state: ['account_id', 'locked_amount', 'effective_stake', 'lock_months',
    'total_claimed', 'total_credits_purchased', 'last_event_type', 'last_event_block', 'updated_at'],
  credit_purchases: ['id', 'block_height', 'block_timestamp', 'receipt_id', 'account_id',
    'amount', 'infra_share', 'rewards_share'],
  cursors: ['id', 'cursor', 'block_num', 'block_id'],
};

/**
 * Generate select permission for a role and table
 */
function generateSelectPermission(
  role: 'free' | 'pro' | 'scale',
  table: string
): object {
  const limits = {
    free: { limit: 100, allow_aggregations: false },
    pro: { limit: 1000, allow_aggregations: true },
    scale: { limit: 10000, allow_aggregations: true },
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

  const roles: ('free' | 'pro' | 'scale')[] = ['free', 'pro', 'scale'];

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

  const roles = ['free', 'pro', 'scale'];

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
