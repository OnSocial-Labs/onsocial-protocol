// src/graph/client.ts
// GraphQL client for The Graph subgraph

import fetch from 'cross-fetch';
import { NETWORKS, Network } from '../core/types';
import { QUERIES } from './queries';
import type {
  GraphClientConfig,
  DataUpdate,
  Account,
  StorageUpdate,
  QueryOptions,
} from './types';

/**
 * GraphClient - Query OnSocial data from The Graph
 *
 * @example
 * ```ts
 * const graph = new GraphClient({ network: 'testnet' });
 *
 * // Get user's data updates
 * const updates = await graph.getDataUpdates('alice.near');
 *
 * // Get user's posts
 * const posts = await graph.getDataByType('alice.near', 'post');
 *
 * // Get account info
 * const account = await graph.getAccount('alice.near');
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

  /**
   * Get data updates for an account
   */
  async getDataUpdates(
    accountId: string,
    options: QueryOptions = {}
  ): Promise<DataUpdate[]> {
    const { first = 100, skip = 0 } = options;
    const result = await this.query<{ dataUpdates: DataUpdate[] }>(
      QUERIES.GET_DATA_UPDATES,
      { accountId, first, skip }
    );
    return result.dataUpdates;
  }

  /**
   * Get data updates filtered by type
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
   * Execute a custom GraphQL query
   */
  async customQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return this.query<T>(query, variables);
  }
}
