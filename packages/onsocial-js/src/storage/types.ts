// src/storage/types.ts
// Storage types for Lighthouse/IPFS integration

/**
 * CID (Content Identifier) - IPFS content address
 */
export type CID = string;

/**
 * Upload response from Lighthouse
 */
export interface UploadResponse {
  /** File name */
  name: string;
  /** IPFS CID (hash) */
  cid: CID;
  /** File size in bytes */
  size: number;
}

/**
 * Options for uploading files
 */
export interface UploadOptions {
  /** Custom file name (optional, defaults to original) */
  name?: string;
  /** MIME type override (optional, auto-detected) */
  mimeType?: string;
  /** Progress callback (0-100) */
  onProgress?: (progress: number) => void;
}

/**
 * Options for uploading text/JSON
 */
export interface UploadTextOptions {
  /** Name for the text content */
  name?: string;
}

/**
 * Storage client configuration
 */
export interface StorageClientConfig {
  /** Lighthouse API key */
  apiKey: string;
  /** Gateway URL for downloads (optional) */
  gatewayUrl?: string;
}

/**
 * File info returned from getUploads
 */
export interface FileInfo {
  cid: CID;
  fileName: string;
  mimeType: string;
  fileSizeInBytes: number;
  createdAt: number;
  encryption: boolean;
}

/**
 * Balance/usage info
 */
export interface StorageBalance {
  /** Data limit in bytes */
  dataLimit: number;
  /** Data used in bytes */
  dataUsed: number;
  /** Remaining bytes */
  remaining: number;
}
