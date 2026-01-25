// src/graph/client.ts
// Hasura GraphQL client for OnSocial Substreams indexer
//
// This client queries data from the Substreams → PostgreSQL → Hasura stack.
// Requires Hasura to be configured with graphql-default naming convention.

import { NETWORKS } from '../core/types';
import { QUERIES } from './queries';
import type {
  GraphClientConfig,
  DataUpdate,
  StorageUpdate,
  GroupUpdate,
  ContractUpdate,
  PermissionUpdate,
  QueryOptions,
  DataQueryOptions,
  GroupQueryOptions,
  ParseResult,
  IndexerStatus,
} from './types';

/**
 * GraphClient - Query OnSocial data from Hasura (Substreams indexer)
 *
 * This is the protocol-level client. It returns indexed event data.
 * For social-specific schemas (Profile, Post, etc.), use @onsocial/sdk.
 *
 * @example
 * ```ts
 * const client = new GraphClient({ network: 'testnet' });
 *
 * // Get data updates for an account
 * const updates = await client.getDataUpdates('alice.near');
 *
 * // Get specific data type
 * const posts = await client.getDataByType('alice.near', 'posts');
 *
 * // Get replies to a post
 * const replies = await client.getReplies('alice.near/posts/123');
 *
 * // Check indexer status
 * const status = await client.getIndexerStatus();
 * ```
 */
export class GraphClient {
  private hasuraUrl: string;
  private headers: Record<string, string>;

  constructor(config: GraphClientConfig = {}) {
    const network = config.network || 'testnet';
    this.hasuraUrl = config.hasuraUrl || NETWORKS[network].hasuraUrl;

    // Build headers
    this.headers = {
      'Content-Type': 'application/json',
    };

    // Add admin secret if provided
    if (config.hasuraAdminSecret) {
      this.headers['X-Hasura-Admin-Secret'] = config.hasuraAdminSecret;
    }
  }

  // ===========================================================================
  // CORE QUERY METHOD
  // ===========================================================================

  /**
   * Execute a GraphQL query against Hasura
   */
  private async query<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const response = await fetch(this.hasuraUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Hasura request failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string; extensions?: unknown }>;
    };

    if (json.errors?.length) {
      const errorMsg = json.errors.map((e) => e.message).join(', ');
      throw new Error(`GraphQL error: ${errorMsg}`);
    }

    return json.data as T;
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Parse the value field of a DataUpdate or GroupUpdate
   * Returns typed result with success/error handling
   */
  parseValue<T>(update: DataUpdate | GroupUpdate | null): ParseResult<T> {
    if (!update || !update.value) {
      return { success: false, error: 'No value to parse', raw: null };
    }
    try {
      const data = JSON.parse(update.value) as T;
      return { success: true, data };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'JSON parse error',
        raw: update.value,
      };
    }
  }

  /**
   * Parse value field, returning data or null
   */
  tryParseValue<T>(update: DataUpdate | GroupUpdate | null): T | null {
    const result = this.parseValue<T>(update);
    return result.success ? result.data : null;
  }

  // ===========================================================================
  // DATA UPDATE QUERIES
  // ===========================================================================

  /**
   * Get data updates for an account
   */
  async getDataUpdates(
    accountId: string,
    options: QueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { limit = 100, offset = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_DATA_UPDATES,
      { accountId, limit, offset }
    );
    return result.dataUpdates;
  }

  /**
   * Get data updates by type (e.g., "profile", "posts")
   */
  async getDataByType(
    accountId: string,
    dataType: string,
    options: QueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { limit = 100, offset = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_DATA_BY_TYPE,
      { accountId, dataType, limit, offset }
    );
    return result.dataUpdates;
  }

  /**
   * Get data by path
   */
  async getDataByPath(path: string): Promise<DataUpdate | null> {
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_DATA_BY_PATH,
      { path }
    );
    return result.dataUpdates[0] || null;
  }

  /**
   * Get recent global activity
   */
  async getRecentActivity(limit: number = 50): Promise<DataUpdate[]> {
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_RECENT_ACTIVITY,
      { limit }
    );
    return result.dataUpdates;
  }

  /**
   * Get group content (data stored under groups/{groupId}/...)
   */
  async getGroupContent(
    groupId: string,
    dataType?: string,
    options: QueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { limit = 50, offset = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_GROUP_CONTENT,
      { groupId, dataType, limit, offset }
    );
    return result.dataUpdates;
  }

  /**
   * Get data by target account (social graph queries)
   * Use for finding followers, blocks, etc.
   */
  async getDataByTarget(
    targetAccount: string,
    dataType?: string,
    options: QueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { limit = 100, offset = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_DATA_BY_TARGET,
      { targetAccount, dataType, limit, offset }
    );
    return result.dataUpdates;
  }

  /**
   * Get replies to a specific path
   */
  async getReplies(
    parentPath: string,
    options: QueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { limit = 50, offset = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_REPLIES,
      { parentPath, limit, offset }
    );
    return result.dataUpdates;
  }

  /**
   * Get quotes/references to a specific path
   */
  async getReferences(
    refPath: string,
    options: QueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { limit = 50, offset = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_REFERENCES,
      { refPath, limit, offset }
    );
    return result.dataUpdates;
  }

  // ===========================================================================
  // STORAGE UPDATE QUERIES
  // ===========================================================================

  /**
   * Get storage updates by author
   */
  async getStorageUpdates(
    author: string,
    limit: number = 50
  ): Promise<StorageUpdate[]> {
    const result = await this.query<{ storageUpdates: StorageUpdate[] }>(
      QUERIES.GET_STORAGE_UPDATES,
      { author, limit }
    );
    return result.storageUpdates;
  }

  /**
   * Get storage history for a target account
   */
  async getStorageHistory(
    targetId: string,
    limit: number = 50
  ): Promise<StorageUpdate[]> {
    const result = await this.query<{ storageUpdates: StorageUpdate[] }>(
      QUERIES.GET_STORAGE_HISTORY,
      { targetId, limit }
    );
    return result.storageUpdates;
  }

  /**
   * Get storage updates by operation type
   */
  async getStorageByOperation(
    operation: string,
    limit: number = 50
  ): Promise<StorageUpdate[]> {
    const result = await this.query<{ storageUpdates: StorageUpdate[] }>(
      QUERIES.GET_STORAGE_BY_OPERATION,
      { operation, limit }
    );
    return result.storageUpdates;
  }

  // ===========================================================================
  // GROUP UPDATE QUERIES
  // ===========================================================================

  /**
   * Get group updates
   */
  async getGroupUpdates(
    groupId: string,
    options: GroupQueryOptions = {}
  ): Promise<GroupUpdate[]> {
    const { limit = 100, offset = 0, operation } = options;

    if (operation) {
      const result = await this.query<{ groupUpdates: GroupUpdate[] }>(
        QUERIES.GET_GROUP_UPDATES_BY_OP,
        { groupId, operation, limit }
      );
      return result.groupUpdates;
    }

    const result = await this.query<{ groupUpdates: GroupUpdate[] }>(
      QUERIES.GET_GROUP_UPDATES,
      { groupId, limit, offset }
    );
    return result.groupUpdates;
  }

  /**
   * Get member updates for a group
   */
  async getMemberUpdates(
    groupId: string,
    memberId?: string,
    limit: number = 50
  ): Promise<GroupUpdate[]> {
    const result = await this.query<{ groupUpdates: GroupUpdate[] }>(
      QUERIES.GET_MEMBER_UPDATES,
      { groupId, memberId, limit }
    );
    return result.groupUpdates;
  }

  /**
   * Get proposal updates
   */
  async getProposalUpdates(
    groupId: string,
    proposalId?: string,
    limit: number = 50
  ): Promise<GroupUpdate[]> {
    const result = await this.query<{ groupUpdates: GroupUpdate[] }>(
      QUERIES.GET_PROPOSAL_UPDATES,
      { groupId, proposalId, limit }
    );
    return result.groupUpdates;
  }

  /**
   * Get groups created by an author
   */
  async getGroupsByAuthor(
    author: string,
    limit: number = 50
  ): Promise<GroupUpdate[]> {
    const result = await this.query<{ groupUpdates: GroupUpdate[] }>(
      QUERIES.GET_GROUPS_BY_AUTHOR,
      { author, limit }
    );
    return result.groupUpdates;
  }

  /**
   * Get groups a user is a member of
   */
  async getUserMemberships(
    memberId: string,
    limit: number = 50
  ): Promise<GroupUpdate[]> {
    const result = await this.query<{ groupUpdates: GroupUpdate[] }>(
      QUERIES.GET_USER_MEMBERSHIPS,
      { memberId, limit }
    );
    return result.groupUpdates;
  }

  // ===========================================================================
  // PERMISSION UPDATE QUERIES
  // ===========================================================================

  /**
   * Get permission updates by author
   */
  async getPermissionUpdates(
    author: string,
    limit: number = 50
  ): Promise<PermissionUpdate[]> {
    const result = await this.query<{ permissionUpdates: PermissionUpdate[] }>(
      QUERIES.GET_PERMISSION_UPDATES,
      { author, limit }
    );
    return result.permissionUpdates;
  }

  /**
   * Get permissions for an account
   */
  async getPermissionsForAccount(
    accountId: string,
    limit: number = 100
  ): Promise<PermissionUpdate[]> {
    const result = await this.query<{ permissionUpdates: PermissionUpdate[] }>(
      QUERIES.GET_PERMISSIONS_FOR_ACCOUNT,
      { accountId, limit }
    );
    return result.permissionUpdates;
  }

  /**
   * Get permission for a specific path
   */
  async getPermissionByPath(
    author: string,
    targetPath: string
  ): Promise<PermissionUpdate | null> {
    const result = await this.query<{ permissionUpdates: PermissionUpdate[] }>(
      QUERIES.GET_PERMISSION_BY_PATH,
      { author, targetPath }
    );
    return result.permissionUpdates[0] || null;
  }

  // ===========================================================================
  // CONTRACT UPDATE QUERIES
  // ===========================================================================

  /**
   * Get contract updates (meta transactions, admin ops)
   */
  async getContractUpdates(limit: number = 50): Promise<ContractUpdate[]> {
    const result = await this.query<{ contractUpdates: ContractUpdate[] }>(
      QUERIES.GET_CONTRACT_UPDATES,
      { limit }
    );
    return result.contractUpdates;
  }

  /**
   * Get contract updates by operation type
   */
  async getContractUpdatesByOp(
    operation: string,
    limit: number = 50
  ): Promise<ContractUpdate[]> {
    const result = await this.query<{ contractUpdates: ContractUpdate[] }>(
      QUERIES.GET_CONTRACT_UPDATES_BY_OP,
      { operation, limit }
    );
    return result.contractUpdates;
  }

  // ===========================================================================
  // INDEXER STATUS
  // ===========================================================================

  /**
   * Get current indexer sync status
   */
  async getIndexerStatus(): Promise<IndexerStatus | null> {
    const result = await this.query<{
      cursors: Array<{ id: string; cursor: string; blockNum: string }>;
    }>(QUERIES.GET_CURSOR);

    if (!result.cursors[0]) {
      return null;
    }

    return {
      id: result.cursors[0].id,
      cursor: result.cursors[0].cursor,
      blockNum: result.cursors[0].blockNum,
    };
  }

  // ===========================================================================
  // CUSTOM QUERY
  // ===========================================================================

  /**
   * Execute a custom GraphQL query
   */
  async customQuery<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    return this.query<T>(query, variables);
  }
}
