// src/graph/queries.ts
// Hasura-native GraphQL queries for OnSocial Substreams indexer
//
// IMPORTANT: These queries require Hasura to be configured with:
//   HASURA_GRAPHQL_EXPERIMENTAL_FEATURES: "naming_convention"
//   HASURA_GRAPHQL_DEFAULT_NAMING_CONVENTION: "graphql-default"
//
// This enables camelCase field names (blockHeight vs block_height)

// =============================================================================
// FIELD FRAGMENTS - Match PostgreSQL schema with camelCase naming convention
// =============================================================================

const DATA_UPDATE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  operation
  author
  partitionId
  path
  value
  accountId
  dataType
  dataId
  groupId
  groupPath
  isGroupContent
  targetAccount
  parentPath
  parentAuthor
  parentType
  refPath
  refAuthor
  refType
  refs
  refAuthors
  derivedId
  derivedType
  writes
`;

const STORAGE_UPDATE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  operation
  author
  partitionId
  amount
  previousBalance
  newBalance
  poolId
  poolKey
  groupId
  reason
  authType
  actorId
  payerId
  targetId
  donor
  payer
`;

const GROUP_UPDATE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  operation
  author
  partitionId
  groupId
  memberId
  role
  level
  path
  value
  proposalId
  proposalType
  status
  description
  voter
  approve
  totalVotes
  yesVotes
  noVotes
`;

const PERMISSION_UPDATE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  operation
  author
  partitionId
  path
  accountId
  permissionType
  targetPath
  permissionKey
  granted
  value
`;

const CONTRACT_UPDATE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  operation
  author
  partitionId
  path
  derivedId
  derivedType
  targetId
  authType
  actorId
  payerId
`;

// =============================================================================
// HASURA-NATIVE QUERIES
// Uses Hasura syntax: where: { field: { _eq: value } }, orderBy: { field: desc }
// =============================================================================

export const QUERIES = {
  // ---------------------------------------------------------------------------
  // Data Updates (posts, profiles, settings, group content)
  // ---------------------------------------------------------------------------

  /**
   * Get data updates for an account
   */
  GET_DATA_UPDATES: `
    query GetDataUpdates($accountId: String!, $limit: Int = 100, $offset: Int = 0) {
      dataUpdates(
        where: { accountId: { _eq: $accountId } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
        offset: $offset
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get data updates by type (e.g., "profile", "posts")
   */
  GET_DATA_BY_TYPE: `
    query GetDataByType($accountId: String!, $dataType: String!, $limit: Int = 100, $offset: Int = 0) {
      dataUpdates(
        where: {
          accountId: { _eq: $accountId }
          dataType: { _eq: $dataType }
          operation: { _eq: "set" }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
        offset: $offset
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get single data item by path
   */
  GET_DATA_BY_PATH: `
    query GetDataByPath($path: String!) {
      dataUpdates(
        where: { path: { _eq: $path } }
        orderBy: { blockTimestamp: DESC }
        limit: 1
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get group content (data stored under groups/{groupId}/...)
   */
  GET_GROUP_CONTENT: `
    query GetGroupContent($groupId: String!, $dataType: String, $limit: Int = 50, $offset: Int = 0) {
      dataUpdates(
        where: {
          groupId: { _eq: $groupId }
          isGroupContent: { _eq: true }
          dataType: { _eq: $dataType }
          operation: { _eq: "set" }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
        offset: $offset
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get recent global activity
   */
  GET_RECENT_ACTIVITY: `
    query GetRecentActivity($limit: Int = 50) {
      dataUpdates(
        where: { operation: { _eq: "set" } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get data by target account (social graph queries)
   */
  GET_DATA_BY_TARGET: `
    query GetDataByTarget($targetAccount: String!, $dataType: String, $limit: Int = 100, $offset: Int = 0) {
      dataUpdates(
        where: {
          targetAccount: { _eq: $targetAccount }
          dataType: { _eq: $dataType }
          operation: { _eq: "set" }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
        offset: $offset
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get replies to a specific path
   */
  GET_REPLIES: `
    query GetReplies($parentPath: String!, $limit: Int = 50, $offset: Int = 0) {
      dataUpdates(
        where: {
          parentPath: { _eq: $parentPath }
          operation: { _eq: "set" }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
        offset: $offset
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get quotes/references to a specific path
   */
  GET_REFERENCES: `
    query GetReferences($refPath: String!, $limit: Int = 50, $offset: Int = 0) {
      dataUpdates(
        where: {
          refPath: { _eq: $refPath }
          operation: { _eq: "set" }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
        offset: $offset
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Storage Updates (deposits, withdrawals, pools)
  // ---------------------------------------------------------------------------

  /**
   * Get storage updates by author
   */
  GET_STORAGE_UPDATES: `
    query GetStorageUpdates($author: String!, $limit: Int = 50) {
      storageUpdates(
        where: { author: { _eq: $author } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${STORAGE_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get storage history for target
   */
  GET_STORAGE_HISTORY: `
    query GetStorageHistory($targetId: String!, $limit: Int = 50) {
      storageUpdates(
        where: { targetId: { _eq: $targetId } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${STORAGE_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get storage updates by operation
   */
  GET_STORAGE_BY_OPERATION: `
    query GetStorageByOperation($operation: String!, $limit: Int = 50) {
      storageUpdates(
        where: { operation: { _eq: $operation } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${STORAGE_UPDATE_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Group Updates (membership, governance, proposals)
  // ---------------------------------------------------------------------------

  /**
   * Get group updates
   */
  GET_GROUP_UPDATES: `
    query GetGroupUpdates($groupId: String!, $limit: Int = 100, $offset: Int = 0) {
      groupUpdates(
        where: { groupId: { _eq: $groupId } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
        offset: $offset
      ) {
        ${GROUP_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get group updates by operation type
   */
  GET_GROUP_UPDATES_BY_OP: `
    query GetGroupUpdatesByOp($groupId: String!, $operation: String!, $limit: Int = 50) {
      groupUpdates(
        where: {
          groupId: { _eq: $groupId }
          operation: { _eq: $operation }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${GROUP_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get member updates for a group
   */
  GET_MEMBER_UPDATES: `
    query GetMemberUpdates($groupId: String!, $memberId: String, $limit: Int = 50) {
      groupUpdates(
        where: {
          groupId: { _eq: $groupId }
          memberId: { _eq: $memberId }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${GROUP_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get proposal updates
   */
  GET_PROPOSAL_UPDATES: `
    query GetProposalUpdates($groupId: String!, $proposalId: String, $limit: Int = 50) {
      groupUpdates(
        where: {
          groupId: { _eq: $groupId }
          proposalId: { _eq: $proposalId }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${GROUP_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get groups by author (created by)
   */
  GET_GROUPS_BY_AUTHOR: `
    query GetGroupsByAuthor($author: String!, $limit: Int = 50) {
      groupUpdates(
        where: {
          author: { _eq: $author }
          operation: { _eq: "group_created" }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${GROUP_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get user memberships
   */
  GET_USER_MEMBERSHIPS: `
    query GetUserMemberships($memberId: String!, $limit: Int = 50) {
      groupUpdates(
        where: {
          memberId: { _eq: $memberId }
          operation: { _in: ["member_added", "member_joined"] }
        }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${GROUP_UPDATE_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Permission Updates (grants, revokes, keys)
  // ---------------------------------------------------------------------------

  /**
   * Get permission updates by author
   */
  GET_PERMISSION_UPDATES: `
    query GetPermissionUpdates($author: String!, $limit: Int = 50) {
      permissionUpdates(
        where: { author: { _eq: $author } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${PERMISSION_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get permissions for account
   */
  GET_PERMISSIONS_FOR_ACCOUNT: `
    query GetPermissionsForAccount($accountId: String!, $limit: Int = 100) {
      permissionUpdates(
        where: { accountId: { _eq: $accountId } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${PERMISSION_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get permission by path
   */
  GET_PERMISSION_BY_PATH: `
    query GetPermissionByPath($author: String!, $targetPath: String!) {
      permissionUpdates(
        where: {
          author: { _eq: $author }
          targetPath: { _eq: $targetPath }
        }
        orderBy: { blockTimestamp: DESC }
        limit: 1
      ) {
        ${PERMISSION_UPDATE_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Contract Updates (meta transactions, admin operations)
  // ---------------------------------------------------------------------------

  /**
   * Get contract updates
   */
  GET_CONTRACT_UPDATES: `
    query GetContractUpdates($limit: Int = 50) {
      contractUpdates(
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${CONTRACT_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get contract updates by operation
   */
  GET_CONTRACT_UPDATES_BY_OP: `
    query GetContractUpdatesByOp($operation: String!, $limit: Int = 50) {
      contractUpdates(
        where: { operation: { _eq: $operation } }
        orderBy: { blockTimestamp: DESC }
        limit: $limit
      ) {
        ${CONTRACT_UPDATE_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Cursor / Indexer Status
  // ---------------------------------------------------------------------------

  /**
   * Get indexer cursor (current sync status)
   */
  GET_CURSOR: `
    query GetCursor {
      cursors(limit: 1) {
        id
        cursor
        blockNum
      }
    }
  `,
};

export default QUERIES;
