// src/graph/queries.ts
// Pre-built GraphQL queries for OnSocial subgraph

export const QUERIES = {
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
        id
        blockHeight
        blockTimestamp
        receiptId
        operation
        author
        path
        value
        accountId
        dataType
        dataId
      }
    }
  `,

  /**
   * Get data updates by type (e.g., "profile", "post")
   */
  GET_DATA_BY_TYPE: `
    query GetDataByType($accountId: String!, $dataType: String!, $first: Int, $skip: Int) {
      dataUpdates(
        where: { accountId: $accountId, dataType: $dataType }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        id
        blockTimestamp
        path
        value
        dataId
      }
    }
  `,

  /**
   * Get account info
   */
  GET_ACCOUNT: `
    query GetAccount($id: ID!) {
      account(id: $id) {
        id
        storageBalance
        firstSeenAt
        lastActiveAt
        dataUpdateCount
        storageUpdateCount
      }
    }
  `,

  /**
   * Get recent global activity
   */
  GET_RECENT_ACTIVITY: `
    query GetRecentActivity($first: Int) {
      dataUpdates(
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
      ) {
        id
        blockTimestamp
        operation
        author
        path
        accountId
        dataType
      }
    }
  `,

  /**
   * Get storage updates for an account
   */
  GET_STORAGE_UPDATES: `
    query GetStorageUpdates($accountId: String!, $first: Int) {
      storageUpdates(
        where: { account: $accountId }
        orderBy: blockTimestamp
        orderDirection: desc
        first: $first
      ) {
        id
        operation
        author
        amount
        newBalance
      }
    }
  `,
};
