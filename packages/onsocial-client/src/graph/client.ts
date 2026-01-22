// src/graph/client.ts
// GraphQL client for The Graph subgraph - Generic protocol layer
import { NETWORKS } from '../core/types';
import { QUERIES } from './queries';
import type {
  GraphClientConfig,
  DataUpdate,
  Account,
  StorageUpdate,
  QueryOptions,
  Group,
  GroupUpdate,
  GroupMember,
  Proposal,
  Permission,
  PermissionUpdate,
  DataQueryOptions,
  GroupQueryOptions,
  ParseResult,
} from './types';

/**
 * GraphClient - Query OnSocial data from The Graph
 *
 * This is the protocol-level client. It returns raw data from the subgraph.
 * For social-specific schemas (Profile, Post, etc.), use onsocial-sdk.
 *
 * @example
 * ```ts
 * const graph = new GraphClient({ network: 'testnet' });
 *
 * // Get raw data updates
 * const updates = await graph.getDataByType('alice.near', 'profile');
 * const profileData = graph.parseValue<MyProfileType>(updates[0]);
 *
 * // Get group and members
 * const group = await graph.getGroup('my-group');
 * const members = await graph.getGroupMembers('my-group');
 *
 * // Get permissions
 * const perms = await graph.getPermissionsGrantedBy('alice.near');
 * ```
 */
export class GraphClient {
  private graphUrl: string;

  constructor(config: GraphClientConfig = {}) {
    const network = config.network || 'testnet';
    this.graphUrl = config.graphUrl || NETWORKS[network].graphUrl;
  }

  /**
   * Execute a GraphQL query
   */
  private async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(this.graphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors[0].message}`);
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
        raw: update.value 
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
  // DATA QUERIES
  // ===========================================================================

  /**
   * Get data updates for an account
   */
  async getDataUpdates(
    accountId: string,
    options: DataQueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { first = 100, skip = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_DATA_UPDATES,
      { accountId, first, skip }
    );
    return result.dataUpdates;
  }

  /**
   * Get data updates filtered by type (profile, post, settings, etc.)
   */
  async getDataByType(
    accountId: string,
    dataType: string,
    options: QueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { first = 100, skip = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_DATA_BY_TYPE,
      { accountId, dataType, first, skip }
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
      { first: limit }
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
    const { first = 50, skip = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_GROUP_CONTENT,
      { groupId, dataType, first, skip }
    );
    return result.dataUpdates;
  }

  // ===========================================================================
  // ACCOUNT QUERIES
  // ===========================================================================

  /**
   * Get account information
   */
  async getAccount(accountId: string): Promise<Account | null> {
    const result = await this.query<{ account: Account | null }>(
      QUERIES.GET_ACCOUNT,
      { id: accountId }
    );
    return result.account;
  }

  /**
   * Get multiple accounts
   */
  async getAccounts(accountIds: string[]): Promise<Account[]> {
    const result = await this.query<{ accounts: Account[] }>(
      QUERIES.GET_ACCOUNTS,
      { ids: accountIds }
    );
    return result.accounts;
  }

  // ===========================================================================
  // STORAGE QUERIES
  // ===========================================================================

  /**
   * Get storage updates for an account
   */
  async getStorageUpdates(
    accountId: string,
    limit: number = 20
  ): Promise<StorageUpdate[]> {
    const result = await this.query<{ storageUpdates: StorageUpdate[] }>(
      QUERIES.GET_STORAGE_UPDATES,
      { accountId, first: limit }
    );
    return result.storageUpdates;
  }

  /**
   * Get storage balance history
   */
  async getStorageHistory(
    accountId: string,
    limit: number = 50
  ): Promise<StorageUpdate[]> {
    const result = await this.query<{ storageUpdates: StorageUpdate[] }>(
      QUERIES.GET_STORAGE_HISTORY,
      { accountId, first: limit }
    );
    return result.storageUpdates;
  }

  // ===========================================================================
  // GROUP QUERIES
  // ===========================================================================

  /**
   * Get group by ID
   */
  async getGroup(groupId: string): Promise<Group | null> {
    const result = await this.query<{ group: Group | null }>(
      QUERIES.GET_GROUP,
      { id: groupId }
    );
    return result.group;
  }

  /**
   * Get groups owned by an account
   */
  async getGroupsByOwner(
    owner: string,
    options: QueryOptions = {}
  ): Promise<Group[]> {
    const { first = 50, skip = 0 } = options;
    const result = await this.query<{ groups: Group[] }>(
      QUERIES.GET_GROUPS_BY_OWNER,
      { owner, first, skip }
    );
    return result.groups;
  }

  /**
   * Get group updates/events
   */
  async getGroupUpdates(
    groupId: string,
    options: GroupQueryOptions = {}
  ): Promise<GroupUpdate[]> {
    const { first = 100, skip = 0, operation } = options;
    if (operation) {
      const result = await this.query<{ groupUpdates: GroupUpdate[] }>(
        QUERIES.GET_GROUP_UPDATES_BY_OP,
        { groupId, operation, first }
      );
      return result.groupUpdates;
    }
    const result = await this.query<{ groupUpdates: GroupUpdate[] }>(
      QUERIES.GET_GROUP_UPDATES,
      { groupId, first, skip }
    );
    return result.groupUpdates;
  }

  // ===========================================================================
  // MEMBER QUERIES
  // ===========================================================================

  /**
   * Get group members
   */
  async getGroupMembers(
    groupId: string,
    options: QueryOptions = {}
  ): Promise<GroupMember[]> {
    const { first = 100, skip = 0 } = options;
    const result = await this.query<{ groupMembers: GroupMember[] }>(
      QUERIES.GET_GROUP_MEMBERS,
      { groupId, first, skip }
    );
    return result.groupMembers;
  }

  /**
   * Get specific member in a group
   */
  async getGroupMember(
    groupId: string,
    memberId: string
  ): Promise<GroupMember | null> {
    const result = await this.query<{ groupMembers: GroupMember[] }>(
      QUERIES.GET_GROUP_MEMBER,
      { groupId, memberId }
    );
    return result.groupMembers[0] || null;
  }

  /**
   * Check if user is member of group
   */
  async isMember(groupId: string, memberId: string): Promise<boolean> {
    const member = await this.getGroupMember(groupId, memberId);
    return member?.isActive ?? false;
  }

  /**
   * Get all groups a user is a member of
   */
  async getUserMemberships(
    memberId: string,
    options: QueryOptions = {}
  ): Promise<GroupMember[]> {
    const { first = 50, skip = 0 } = options;
    const result = await this.query<{ groupMembers: GroupMember[] }>(
      QUERIES.GET_USER_MEMBERSHIPS,
      { memberId, first, skip }
    );
    return result.groupMembers;
  }

  // ===========================================================================
  // PROPOSAL QUERIES
  // ===========================================================================

  /**
   * Get proposals for a group
   */
  async getProposals(
    groupId: string,
    status?: string,
    options: QueryOptions = {}
  ): Promise<Proposal[]> {
    const { first = 50, skip = 0 } = options;
    const result = await this.query<{ proposals: Proposal[] }>(
      QUERIES.GET_PROPOSALS,
      { groupId, status, first, skip }
    );
    return result.proposals;
  }

  /**
   * Get active proposals for a group
   */
  async getActiveProposals(
    groupId: string,
    limit: number = 20
  ): Promise<Proposal[]> {
    const result = await this.query<{ proposals: Proposal[] }>(
      QUERIES.GET_ACTIVE_PROPOSALS,
      { groupId, first: limit }
    );
    return result.proposals;
  }

  /**
   * Get proposal by ID
   */
  async getProposal(proposalId: string): Promise<Proposal | null> {
    const result = await this.query<{ proposal: Proposal | null }>(
      QUERIES.GET_PROPOSAL,
      { id: proposalId }
    );
    return result.proposal;
  }

  // ===========================================================================
  // PERMISSION QUERIES
  // ===========================================================================

  /**
   * Get permissions granted by an account
   */
  async getPermissionsGrantedBy(
    granter: string,
    options: QueryOptions = {}
  ): Promise<Permission[]> {
    const { first = 100, skip = 0 } = options;
    const result = await this.query<{ permissions: Permission[] }>(
      QUERIES.GET_PERMISSIONS_BY_GRANTER,
      { granter, first, skip }
    );
    return result.permissions;
  }

  /**
   * Get permissions granted to an account
   */
  async getPermissionsGrantedTo(
    grantee: string,
    options: QueryOptions = {}
  ): Promise<Permission[]> {
    const { first = 100, skip = 0 } = options;
    const result = await this.query<{ permissions: Permission[] }>(
      QUERIES.GET_PERMISSIONS_BY_GRANTEE,
      { grantee, first, skip }
    );
    return result.permissions;
  }

  /**
   * Check permission for specific path
   */
  async getPermission(
    granter: string,
    grantee: string,
    path: string
  ): Promise<Permission | null> {
    const result = await this.query<{ permissions: Permission[] }>(
      QUERIES.GET_PERMISSION_FOR_PATH,
      { granter, grantee, path }
    );
    return result.permissions[0] || null;
  }

  /**
   * Check if grantee has permission level on path
   */
  async hasPermission(
    granter: string,
    grantee: string,
    path: string,
    requiredLevel: number = 1
  ): Promise<boolean> {
    const perm = await this.getPermission(granter, grantee, path);
    return perm !== null && perm.isActive && perm.level >= requiredLevel;
  }

  /**
   * Get permission update events
   */
  async getPermissionUpdates(
    author: string,
    limit: number = 50
  ): Promise<PermissionUpdate[]> {
    const result = await this.query<{ permissionUpdates: PermissionUpdate[] }>(
      QUERIES.GET_PERMISSION_UPDATES,
      { author, first: limit }
    );
    return result.permissionUpdates;
  }

  // ===========================================================================
  // CUSTOM QUERY
  // ===========================================================================

  /**
   * Execute a custom GraphQL query
   */
  async customQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return this.query<T>(query, variables);
  }
}
