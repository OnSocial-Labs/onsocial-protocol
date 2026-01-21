// src/storage/types.ts
// Storage types for Lighthouse/IPFS integration

/** IPFS Content Identifier */
export type CID = string;

/** Upload result */
export interface UploadResponse {
  name: string;
  cid: CID;
  size: number;
}

/** Storage client configuration */
export interface StorageClientConfig {
  apiKey: string;
  gatewayUrl?: string;
}

/** File metadata */
export interface FileInfo {
  cid: CID;
  fileName: string;
  mimeType: string;
  fileSizeInBytes: number;
  encryption: boolean;
}

/** Storage usage */
export interface StorageBalance {
  limit: number;
  used: number;
  remaining: number;
}

/** Auth for encryption operations */
export interface EncryptionAuth {
  publicKey: string;
  signedMessage: string;
}

/** Token-gating access condition */
export interface AccessCondition {
  id: number;
  chain: string;
  method: string;
  standardContractType?: string;
  contractAddress: string;
  returnValueTest: { comparator: string; value: string };
  parameters: string[];
}
