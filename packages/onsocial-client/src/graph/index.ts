// src/graph/index.ts
// Graph module exports - Hasura client for Substreams indexer

export { GraphClient } from './client';
export { QUERIES } from './queries';
export type {
  // Config & Options
  GraphClientConfig,
  QueryOptions,
  DataQueryOptions,
  GroupQueryOptions,
  PermissionQueryOptions,
  // Event Entities (immutable)
  DataUpdate,
  StorageUpdate,
  GroupUpdate,
  ContractUpdate,
  PermissionUpdate,
  // Indexer Status
  IndexerStatus,
  // Utility Types
  ParseResult,
} from './types';
