// src/graph/queries.ts
// Comprehensive GraphQL queries for OnSocial subgraph

// =============================================================================
// FRAGMENT DEFINITIONS - Reusable field selections
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
  refPath
  refAuthor
  derivedId
  derivedType
`;

const STORAGE_UPDATE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  operation
  author
  amount
  previousBalance
  newBalance
  poolId
  groupId
  reason
  targetId
`;

const GROUP_UPDATE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  operation
  author
  groupId
  memberId
  level
  path
  value
  proposalId
  proposalType
  status
  description
  yesVotes
  noVotes
  totalVotes
  isPrivate
  fromGovernance
`;

const PERMISSION_UPDATE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  operation
  author
  grantee
  publicKey
  path
  level
  expiresAt
  groupId
  deleted
`;

const ACCOUNT_FIELDS = `
  id
  storageBalance
  firstSeenAt
  lastActiveAt
  dataUpdateCount
  storageUpdateCount
  permissionUpdateCount
`;

const GROUP_FIELDS = `
  id
  owner
  isPrivate
  memberDriven
  memberCount
  proposalCount
  createdAt
  lastActivityAt
  votingPeriod
  participationQuorum
  majorityThreshold
  poolBalance
`;

const GROUP_MEMBER_FIELDS = `
  id
  groupId
  memberId
  level
  nonce
  isActive
  isBlacklisted
  joinedAt
  leftAt
  lastActiveAt
`;

const PROPOSAL_FIELDS = `
  id
  groupId
  proposalId
  sequenceNumber
  proposalType
  description
  proposer
  status
  yesVotes
  noVotes
  totalVotes
  lockedMemberCount
  votingPeriod
  participationQuorum
  majorityThreshold
  createdAt
  expiresAt
  executedAt
  updatedAt
  customData
`;

const PERMISSION_FIELDS = `
  id
  granter
  grantee
  publicKey
  path
  level
  groupId
  expiresAt
  isExpired
  grantedAt
  revokedAt
  isActive
`;

// =============================================================================
// DATA QUERIES
// =============================================================================

export const QUERIES = {
  // ---------------------------------------------------------------------------
  // Data Updates
  // ---------------------------------------------------------------------------

  /**
   * Get data updates for an account
   */
  GET_DATA_UPDATES: `
    query GetDataUpdates($accountId: String!, $first: Int, $skip: Int) {
      dataUpdates(
        where: { accountId: $accountId }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get data updates by type (e.g., "profile", "post")
   */
  GET_DATA_BY_TYPE: `
    query GetDataByType($accountId: String!, $dataType: String!, $first: Int, $skip: Int) {
      dataUpdates(
        where: { accountId: $accountId, dataType: $dataType, operation: "set" }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
        skip: $skip
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
        where: { path: $path }
        orderBy: blockTimestamp
        orderDirection: desc
        first: 1
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get group content
   */
  GET_GROUP_CONTENT: `
    query GetGroupContent($groupId: String!, $dataType: String, $first: Int, $skip: Int) {
      dataUpdates(
        where: { groupId: $groupId, isGroupContent: true, dataType: $dataType, operation: "set" }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get recent global activity
   */
  GET_RECENT_ACTIVITY: `
    query GetRecentActivity($first: Int) {
      dataUpdates(
        where: { operation: "set" }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Flexible data query with dynamic where clause
   * Supports all indexed fields: accountId, dataType, groupId, isGroupContent,
   * targetAccount, replyToPath, replyToAuthor, quotedPath, quotedAuthor
   */
  QUERY_DATA_UPDATES: `
    query QueryDataUpdates($where: DataUpdate_filter!, $first: Int, $skip: Int, $orderBy: DataUpdate_orderBy, $orderDirection: OrderDirection) {
      dataUpdates(
        where: $where
        orderBy: $orderBy
        orderDirection: $orderDirection
        first: $first
        skip: $skip
      ) {
        ${DATA_UPDATE_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Account Queries
  // ---------------------------------------------------------------------------

  /**
   * Get account info
   */
  GET_ACCOUNT: `
    query GetAccount($id: ID!) {
      account(id: $id) {
        ${ACCOUNT_FIELDS}
      }
    }
  `,

  /**
   * Get multiple accounts
   */
  GET_ACCOUNTS: `
    query GetAccounts($ids: [ID!]!) {
      accounts(where: { id_in: $ids }) {
        ${ACCOUNT_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Storage Queries
  // ---------------------------------------------------------------------------

  /**
   * Get storage updates for an account
   */
  GET_STORAGE_UPDATES: `
    query GetStorageUpdates($accountId: String!, $first: Int) {
      storageUpdates(
        where: { author: $accountId }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
      ) {
        ${STORAGE_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get storage balance history
   */
  GET_STORAGE_HISTORY: `
    query GetStorageHistory($accountId: String!, $first: Int) {
      storageUpdates(
        where: { targetId: $accountId }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
      ) {
        ${STORAGE_UPDATE_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Group Queries
  // ---------------------------------------------------------------------------

  /**
   * Get group by ID
   */
  GET_GROUP: `
    query GetGroup($id: ID!) {
      group(id: $id) {
        ${GROUP_FIELDS}
      }
    }
  `,

  /**
   * Get groups owned by account
   */
  GET_GROUPS_BY_OWNER: `
    query GetGroupsByOwner($owner: String!, $first: Int, $skip: Int) {
      groups(
        where: { owner: $owner }
        orderBy: createdAt
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${GROUP_FIELDS}
      }
    }
  `,

  /**
   * Get group updates
   */
  GET_GROUP_UPDATES: `
    query GetGroupUpdates($groupId: String!, $first: Int, $skip: Int) {
      groupUpdates(
        where: { groupId: $groupId }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${GROUP_UPDATE_FIELDS}
      }
    }
  `,

  /**
   * Get group updates by operation
   */
  GET_GROUP_UPDATES_BY_OP: `
    query GetGroupUpdatesByOp($groupId: String!, $operation: String!, $first: Int) {
      groupUpdates(
        where: { groupId: $groupId, operation: $operation }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
      ) {
        ${GROUP_UPDATE_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Member Queries
  // ---------------------------------------------------------------------------

  /**
   * Get group members
   */
  GET_GROUP_MEMBERS: `
    query GetGroupMembers($groupId: String!, $first: Int, $skip: Int) {
      groupMembers(
        where: { groupId: $groupId, isActive: true }
        orderBy: joinedAt
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${GROUP_MEMBER_FIELDS}
      }
    }
  `,

  /**
   * Get member by ID
   */
  GET_GROUP_MEMBER: `
    query GetGroupMember($groupId: String!, $memberId: String!) {
      groupMembers(
        where: { groupId: $groupId, memberId: $memberId }
        first: 1
      ) {
        ${GROUP_MEMBER_FIELDS}
      }
    }
  `,

  /**
   * Get groups a user is member of
   */
  GET_USER_MEMBERSHIPS: `
    query GetUserMemberships($memberId: String!, $first: Int, $skip: Int) {
      groupMembers(
        where: { memberId: $memberId, isActive: true }
        orderBy: joinedAt
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${GROUP_MEMBER_FIELDS}
        group {
          ${GROUP_FIELDS}
        }
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Proposal Queries
  // ---------------------------------------------------------------------------

  /**
   * Get proposals for a group
   */
  GET_PROPOSALS: `
    query GetProposals($groupId: String!, $status: String, $first: Int, $skip: Int) {
      proposals(
        where: { groupId: $groupId, status: $status }
        orderBy: createdAt
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${PROPOSAL_FIELDS}
      }
    }
  `,

  /**
   * Get active proposals
   */
  GET_ACTIVE_PROPOSALS: `
    query GetActiveProposals($groupId: String!, $first: Int) {
      proposals(
        where: { groupId: $groupId, status: "active" }
        orderBy: expiresAt
        orderDirection: asc
        first: $first
      ) {
        ${PROPOSAL_FIELDS}
      }
    }
  `,

  /**
   * Get proposal by ID
   */
  GET_PROPOSAL: `
    query GetProposal($id: ID!) {
      proposal(id: $id) {
        ${PROPOSAL_FIELDS}
      }
    }
  `,

  // ---------------------------------------------------------------------------
  // Permission Queries
  // ---------------------------------------------------------------------------

  /**
   * Get permissions granted by an account
   */
  GET_PERMISSIONS_BY_GRANTER: `
    query GetPermissionsByGranter($granter: String!, $first: Int, $skip: Int) {
      permissions(
        where: { granter: $granter, isActive: true }
        orderBy: grantedAt
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${PERMISSION_FIELDS}
      }
    }
  `,

  /**
   * Get permissions granted to an account
   */
  GET_PERMISSIONS_BY_GRANTEE: `
    query GetPermissionsByGrantee($grantee: String!, $first: Int, $skip: Int) {
      permissions(
        where: { grantee: $grantee, isActive: true }
        orderBy: grantedAt
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        ${PERMISSION_FIELDS}
      }
    }
  `,

  /**
   * Get permission for specific path
   */
  GET_PERMISSION_FOR_PATH: `
    query GetPermissionForPath($granter: String!, $grantee: String!, $path: String!) {
      permissions(
        where: { granter: $granter, grantee: $grantee, path: $path, isActive: true }
        first: 1
      ) {
        ${PERMISSION_FIELDS}
      }
    }
  `,

  /**
   * Get permission updates
   */
  GET_PERMISSION_UPDATES: `
    query GetPermissionUpdates($author: String!, $first: Int) {
      permissionUpdates(
        where: { author: $author }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
      ) {
        ${PERMISSION_UPDATE_FIELDS}
      }
    }
  `,
};

export default QUERIES;
