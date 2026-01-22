// src/index.ts
// @onsocial/client - OnSocial client library
//
// This is the low-level protocol SDK. For social-specific schemas
// (Profile, Post, Comment, etc.), use onsocial-sdk.
//
// Modules:
// - core: Network configuration and types
// - graph: Query data from The Graph subgraph
// - storage: IPFS/Filecoin storage via Lighthouse
// - utils: Helper utilities

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
  // Aggregate Entities (mutable)
  Account,
  Group,
  GroupMember,
  Proposal,
  Permission,
  StoragePool,
  // Utility Types
  ParseResult,
} from './graph';

// Storage exports
export { StorageClient } from './storage';
export type { StorageClientConfig, UploadResponse, CID } from './storage';

// Utils exports
export { isValidAccountId, parsePath, buildPath } from './utils';
