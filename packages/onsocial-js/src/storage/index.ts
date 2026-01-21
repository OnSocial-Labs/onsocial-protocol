// src/storage/index.ts
export { StorageClient } from './client';
export type {
  CID,
  UploadResponse,
  StorageClientConfig,
  FileInfo,
  StorageBalance,
  EncryptionAuth,
  AccessCondition,
} from './types';
export const LIGHTHOUSE_GATEWAY = 'https://gateway.lighthouse.storage';
