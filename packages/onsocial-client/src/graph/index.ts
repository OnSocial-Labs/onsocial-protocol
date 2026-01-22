// src/graph/index.ts
// Graph module exports - Generic protocol layer

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
  // Aggregate Entities (mutable)
  Account,
  Group,
  GroupMember,
  Proposal,
  Permission,
  StoragePool,
  // Utility Types
  ParseResult,
} from './types';
