// src/index.ts
// onsocial-js - Protocol-level SDK for OnSocial
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
  GraphClientConfig,
  DataUpdate,
  Account,
  StorageUpdate,
  QueryOptions,
} from './graph';

// Storage exports
export { StorageClient } from './storage';
export type {
  StorageClientConfig,
  UploadResponse,
  FileInfo,
  StorageBalance,
  CID,
} from './storage';

// Utils exports
export { isValidAccountId, parsePath, buildPath } from './utils';
