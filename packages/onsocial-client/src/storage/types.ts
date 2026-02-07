// src/storage/types.ts
// Storage types for IPFS integration

/** IPFS Content Identifier */
export type CID = string;

/** Upload result */
export interface UploadResponse {
  cid: CID;
  size: number;
  name: string;
}

/** Storage client configuration */
export interface StorageClientConfig {
  /** Backend endpoint (default: https://api.onsocial.id/storage) */
  endpoint?: string;
  /** IPFS gateway (default: https://gateway.lighthouse.storage) */
  gateway?: string;
}
