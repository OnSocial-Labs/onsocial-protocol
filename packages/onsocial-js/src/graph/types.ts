// src/graph/types.ts
// Types for The Graph client (mirrors subgraph schema)

/**
 * Data update from the subgraph
 */
export interface DataUpdate {
  id: string;
  blockHeight: string;
  blockTimestamp: string;
  receiptId: string;
  operation: 'SET' | 'DEL';
  author: string;
  path: string;
  value: string | null;
  accountId: string;
  dataType: string | null;
  dataId: string | null;
}

/**
 * Account from the subgraph
 */
export interface Account {
  id: string;
  storageBalance: string;
  firstSeenAt: string;
  lastActiveAt: string;
  dataUpdateCount: number;
  storageUpdateCount: number;
}

/**
 * Storage update from the subgraph
 */
export interface StorageUpdate {
  id: string;
  operation: 'DEPOSIT' | 'WITHDRAW';
  author: string;
  amount: string | null;
  newBalance: string | null;
}

/**
 * Query options for pagination
 */
export interface QueryOptions {
  first?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
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
