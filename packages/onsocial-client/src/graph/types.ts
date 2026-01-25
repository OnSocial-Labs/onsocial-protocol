// src/graph/types.ts
// Types for Hasura GraphQL client - matches Substreams PostgreSQL schema
//
// These types use camelCase to match Hasura's graphql-default naming convention.
// The underlying PostgreSQL tables use snake_case, but Hasura auto-converts.

// =============================================================================
// EVENT ENTITIES (Immutable - one per blockchain event)
// =============================================================================

/**
 * Data update event (profiles, posts, settings, group content)
 * Table: data_updates
 */
export interface DataUpdate {
  id: string;
  blockHeight: string;
  blockTimestamp: string;
  receiptId: string;
  operation: 'set' | 'remove';
  author: string;
  partitionId: number | null;
  path: string;
  value: string | null;
  // Derived fields
  accountId: string;
  dataType: string | null;
  dataId: string | null;
  groupId: string | null;
  groupPath: string | null;
  isGroupContent: boolean;
  // Social graph
  targetAccount: string | null;
  // Hierarchical reference (replies, comments)
  parentPath: string | null;
  parentAuthor: string | null;
  parentType: string | null;
  // Primary lateral reference (quotes, citations)
  refPath: string | null;
  refAuthor: string | null;
  refType: string | null;
  // Multiple references (multi-quote)
  refs: string | null;
  refAuthors: string | null;
  // Contract derived
  derivedId: string | null;
  derivedType: string | null;
  writes: string | null;
}

/**
 * Storage update event (deposits, withdrawals, pools)
 * Table: storage_updates
 */
export interface StorageUpdate {
  id: string;
  blockHeight: string;
  blockTimestamp: string;
  receiptId: string;
  operation: string;
  author: string;
  partitionId: number | null;
  amount: string | null;
  previousBalance: string | null;
  newBalance: string | null;
  poolId: string | null;
  poolKey: string | null;
  groupId: string | null;
  reason: string | null;
  authType: string | null;
  actorId: string | null;
  payerId: string | null;
  targetId: string | null;
  donor: string | null;
  payer: string | null;
}

/**
 * Group update event (membership, governance, proposals)
 * Table: group_updates
 */
export interface GroupUpdate {
  id: string;
  blockHeight: string;
  blockTimestamp: string;
  receiptId: string;
  operation: string;
  author: string;
  partitionId: number | null;
  groupId: string | null;
  memberId: string | null;
  role: string | null;
  level: number | null;
  path: string | null;
  value: string | null;
  proposalId: string | null;
  proposalType: string | null;
  status: string | null;
  description: string | null;
  voter: string | null;
  approve: boolean | null;
  totalVotes: number | null;
  yesVotes: number | null;
  noVotes: number | null;
}

/**
 * Permission update event (grants, revokes, keys)
 * Table: permission_updates
 */
export interface PermissionUpdate {
  id: string;
  blockHeight: string;
  blockTimestamp: string;
  receiptId: string;
  operation: string;
  author: string;
  partitionId: number | null;
  path: string | null;
  accountId: string | null;
  permissionType: string | null;
  targetPath: string | null;
  permissionKey: string | null;
  granted: boolean | null;
  value: string | null;
}

/**
 * Contract update event (meta transactions, admin operations)
 * Table: contract_updates
 */
export interface ContractUpdate {
  id: string;
  blockHeight: string;
  blockTimestamp: string;
  receiptId: string;
  operation: string;
  author: string;
  partitionId: number | null;
  path: string | null;
  derivedId: string | null;
  derivedType: string | null;
  targetId: string | null;
  authType: string | null;
  actorId: string | null;
  payerId: string | null;
}

// =============================================================================
// INDEXER STATUS
// =============================================================================

/**
 * Indexer cursor - tracks sync progress
 * Table: cursors
 */
export interface IndexerStatus {
  id: string;
  cursor: string;
  blockNum: string;
}

// =============================================================================
// QUERY OPTIONS & CONFIG
// =============================================================================

/**
 * Pagination options (Hasura style)
 */
export interface QueryOptions {
  /** Maximum results to return (default: 100) */
  limit?: number;
  /** Number of results to skip (default: 0) */
  offset?: number;
}

/**
 * Filter options for data queries
 */
export interface DataQueryOptions extends QueryOptions {
  accountId?: string;
  operation?: 'set' | 'remove';
  dataType?: string;
  groupId?: string;
  isGroupContent?: boolean;
  targetAccount?: string;
  parentPath?: string;
  parentAuthor?: string;
  refPath?: string;
  refAuthor?: string;
}

/**
 * Filter options for group queries
 */
export interface GroupQueryOptions extends QueryOptions {
  operation?: string;
  memberId?: string;
  proposalId?: string;
}

/**
 * Filter options for permission queries
 */
export interface PermissionQueryOptions extends QueryOptions {
  accountId?: string;
  targetPath?: string;
}

/**
 * Graph client configuration
 */
export interface GraphClientConfig {
  /** Network to connect to */
  network?: 'mainnet' | 'testnet';
  /** Custom Hasura URL (overrides network default) */
  hasuraUrl?: string;
  /** Hasura admin secret for authenticated queries */
  hasuraAdminSecret?: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Result of parsing a value field
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; raw: string | null };
