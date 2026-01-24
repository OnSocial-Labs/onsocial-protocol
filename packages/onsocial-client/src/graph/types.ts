// src/graph/types.ts
// Types for The Graph client - mirrors subgraph schema exactly

// =============================================================================
// IMMUTABLE EVENT ENTITIES
// =============================================================================

/**
 * Data update event (profiles, posts, settings, group content)
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
  accountId: string;
  dataType: string | null;
  dataId: string | null;
  groupId: string | null;
  groupPath: string | null;
  isGroupContent: boolean;
  // Social graph
  targetAccount: string | null;
  // Reference fields
  parentPath: string | null;
  parentAuthor: string | null;
  refPath: string | null;
  refAuthor: string | null;
  // Contract derived
  derivedId: string | null;
  derivedType: string | null;
  writes: string | null;
}

/**
 * Storage update event (deposits, withdrawals, pools)
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
  previousPoolBalance: string | null;
  newPoolBalance: string | null;
  groupId: string | null;
  bytes: string | null;
  remainingAllowance: string | null;
  poolAccount: string | null;
  reason: string | null;
  authType: string | null;
  actorId: string | null;
  payerId: string | null;
  targetId: string | null;
  availableBalance: string | null;
  donor: string | null;
  payer: string | null;
}

/**
 * Group update event (membership, governance, proposals)
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
  memberNonce: string | null;
  memberNoncePath: string | null;
  role: string | null;
  level: number | null;
  path: string | null;
  value: string | null;
  poolKey: string | null;
  amount: string | null;
  previousPoolBalance: string | null;
  newPoolBalance: string | null;
  proposalId: string | null;
  proposalType: string | null;
  status: string | null;
  sequenceNumber: string | null;
  description: string | null;
  autoVote: boolean | null;
  createdAt: string | null;
  expiresAt: string | null;
  voter: string | null;
  approve: boolean | null;
  totalVotes: number | null;
  yesVotes: number | null;
  noVotes: number | null;
  shouldExecute: boolean | null;
  shouldReject: boolean | null;
  votedAt: string | null;
  isPrivate: boolean | null;
  changedAt: string | null;
  fromGovernance: boolean | null;
}

/**
 * Contract update event (admin, config)
 */
export interface ContractUpdate {
  id: string;
  blockHeight: string;
  blockTimestamp: string;
  receiptId: string;
  operation: string;
  author: string;
  partitionId: number | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  path: string | null;
  targetId: string | null;
  authType: string | null;
  actorId: string | null;
  payerId: string | null;
  publicKey: string | null;
  nonce: string | null;
}

/**
 * Permission update event (grants, revokes)
 */
export interface PermissionUpdate {
  id: string;
  blockHeight: string;
  blockTimestamp: string;
  receiptId: string;
  operation: 'grant' | 'revoke';
  author: string;
  partitionId: number | null;
  grantee: string | null;
  publicKey: string | null;
  path: string;
  level: number;
  expiresAt: string | null;
  permissionNonce: string | null;
  groupId: string | null;
  deleted: boolean | null;
}

// =============================================================================
// MUTABLE AGGREGATE ENTITIES
// =============================================================================

/**
 * Account aggregate - current state
 */
export interface Account {
  id: string;
  storageBalance: string;
  firstSeenAt: string;
  lastActiveAt: string;
  dataUpdateCount: number;
  storageUpdateCount: number;
  permissionUpdateCount: number;
}

/**
 * Group aggregate - current state
 */
export interface Group {
  id: string;
  owner: string;
  isPrivate: boolean;
  memberDriven: boolean;
  memberCount: number;
  proposalCount: number;
  createdAt: string;
  lastActivityAt: string;
  votingPeriod: string | null;
  participationQuorum: number | null;
  majorityThreshold: number | null;
  poolBalance: string | null;
}

/**
 * Group member aggregate - current membership
 */
export interface GroupMember {
  id: string;
  groupId: string;
  memberId: string;
  level: number;
  nonce: string;
  isActive: boolean;
  isBlacklisted: boolean;
  joinedAt: string;
  leftAt: string | null;
  lastActiveAt: string;
}

/**
 * Proposal aggregate - governance proposal state
 */
export interface Proposal {
  id: string;
  groupId: string;
  proposalId: string;
  sequenceNumber: string | null;
  proposalType: string;
  description: string | null;
  proposer: string;
  status: 'active' | 'executed' | 'rejected' | 'expired';
  yesVotes: number;
  noVotes: number;
  totalVotes: number;
  lockedMemberCount: number;
  votingPeriod: string | null;
  participationQuorum: number | null;
  majorityThreshold: number | null;
  lockedDeposit: string | null;
  createdAt: string;
  expiresAt: string | null;
  executedAt: string | null;
  updatedAt: string;
  customData: string | null;
}

/**
 * Permission aggregate - active permission
 */
export interface Permission {
  id: string;
  granter: string;
  grantee: string | null;
  publicKey: string | null;
  path: string;
  level: number;
  groupId: string | null;
  permissionNonce: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  grantedAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

/**
 * Storage pool aggregate
 */
export interface StoragePool {
  id: string;
  poolType: 'user' | 'shared' | 'group' | 'platform';
  balance: string;
  groupId: string | null;
  sharedBytes: string | null;
  usedBytes: string | null;
  createdAt: string;
  lastUpdatedAt: string;
}

// =============================================================================
// QUERY OPTIONS & CONFIG
// =============================================================================

/**
 * Pagination options
 */
export interface QueryOptions {
  first?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
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
  // Social graph filters
  targetAccount?: string;
  // Reference filters
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
  grantee?: string;
  path?: string;
  isActive?: boolean;
}

/**
 * Graph client configuration
 */
export interface GraphClientConfig {
  /** Network to connect to */
  network?: 'mainnet' | 'testnet';
  /** Custom graph URL (overrides network default) */
  graphUrl?: string;
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

