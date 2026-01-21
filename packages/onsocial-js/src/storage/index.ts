// src/storage/index.ts
// Storage module exports

export { StorageClient } from './client';
export type {
  CID,
  UploadResponse,
  UploadOptions,
  UploadTextOptions,
  StorageClientConfig,
  FileInfo,
  StorageBalance,
} from './types';

// Re-export gateway URL for convenience
export { LIGHTHOUSE_GATEWAY } from './lighthouse';
