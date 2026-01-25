// src/index.ts
// @onsocial/client - OnSocial client library
//
// This is the low-level protocol SDK. For social-specific schemas
// (Profile, Post, Comment, etc.), use @onsocial/sdk.
//
// Modules:
// - core: Network configuration and types
// - graph: Query data from Hasura (Substreams indexer)
// - storage: IPFS/Filecoin storage via Lighthouse
// - utils: Helper utilities
//
// IMPORTANT: Hasura must be configured with graphql-default naming convention
// See: https://hasura.io/docs/latest/schema/postgres/naming-convention/

// Core exports
export { NETWORKS } from './core';
export type { Network, NetworkConfig } from './core';

// Graph exports
export { GraphClient, QUERIES } from './graph';
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
} from './graph';

// Storage exports
export { StorageClient } from './storage';
export type { StorageClientConfig, UploadResponse, CID } from './storage';

// Utils exports
export { isValidAccountId, parsePath, buildPath } from './utils';
