// src/storage/client.ts
// StorageClient - Thin wrapper around @lighthouse-web3/sdk

import lighthouse from '@lighthouse-web3/sdk';
import type {
  CID,
  UploadResponse,
  StorageClientConfig,
  FileInfo,
  StorageBalance,
  AccessCondition,
  EncryptionAuth,
} from './types';

const LIGHTHOUSE_GATEWAY = 'https://gateway.lighthouse.storage';

/**
 * StorageClient - IPFS/Lighthouse storage for OnSocial
 *
 * @example
 * ```ts
 * const storage = new StorageClient({ apiKey: 'xxx' });
 * const { cid } = await storage.upload(file);
 * const url = storage.getUrl(cid);
 * ```
 */
export class StorageClient {
  readonly apiKey: string;
  readonly gatewayUrl: string;

  constructor(config: StorageClientConfig) {
    if (!config.apiKey) throw new Error('StorageClient requires an API key');
    this.apiKey = config.apiKey;
    this.gatewayUrl = config.gatewayUrl || LIGHTHOUSE_GATEWAY;
  }

  // ─────────────────────────────────────────────────────────────
  // UPLOAD
  // ─────────────────────────────────────────────────────────────

  /** Upload binary data (File, Blob, Buffer, ArrayBuffer, Uint8Array) */
  async upload(data: File | Blob | ArrayBuffer | Uint8Array | Buffer): Promise<UploadResponse> {
    let buffer: Buffer | Blob;
    if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(new Uint8Array(data));
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else {
      buffer = data;
    }
    const result = await lighthouse.uploadBuffer(buffer, this.apiKey);
    return this.parseUploadResult(result.data);
  }

  /** Upload text content */
  async uploadText(text: string, name = 'text'): Promise<UploadResponse> {
    const result = await lighthouse.uploadText(text, this.apiKey, name);
    return this.parseUploadResult(result.data);
  }

  /** Upload JSON (serializes automatically) */
  async uploadJSON(data: unknown, name = 'data.json'): Promise<UploadResponse> {
    return this.uploadText(JSON.stringify(data), name);
  }

  // ─────────────────────────────────────────────────────────────
  // DOWNLOAD
  // ─────────────────────────────────────────────────────────────

  /** Download raw bytes from IPFS */
  async download(cid: CID): Promise<ArrayBuffer> {
    const response = await fetch(this.getUrl(cid));
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return response.arrayBuffer();
  }

  /** Download and decode as text */
  async downloadText(cid: CID): Promise<string> {
    const data = await this.download(cid);
    return new TextDecoder().decode(data);
  }

  /** Download and parse as JSON */
  async downloadJSON<T = unknown>(cid: CID): Promise<T> {
    return JSON.parse(await this.downloadText(cid)) as T;
  }

  // ─────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────

  /** Get gateway URL for a CID (use in <img src={...}>) */
  getUrl(cid: CID): string {
    return `${this.gatewayUrl}/ipfs/${cid}`;
  }

  /** Get file metadata */
  async getFileInfo(cid: CID): Promise<FileInfo> {
    const { data } = await lighthouse.getFileInfo(cid);
    return {
      cid: data.cid,
      fileName: data.fileName,
      mimeType: data.mimeType,
      fileSizeInBytes: Number(data.fileSizeInBytes),
      encryption: data.encryption,
    };
  }

  /** List your uploaded files */
  async listUploads(cursor?: string): Promise<{ files: FileInfo[]; total: number }> {
    const { data } = await lighthouse.getUploads(this.apiKey, cursor ?? null);
    return {
      files: data.fileList.map((f) => ({
        cid: f.cid,
        fileName: f.fileName,
        mimeType: f.mimeType,
        fileSizeInBytes: Number(f.fileSizeInBytes),
        encryption: f.encryption,
      })),
      total: data.totalFiles,
    };
  }

  /** Delete a file by ID (from listUploads, not CID) */
  async delete(fileId: string): Promise<void> {
    await lighthouse.deleteFile(this.apiKey, fileId);
  }

  /** Get storage usage */
  async getBalance(): Promise<StorageBalance> {
    const { data } = await lighthouse.getBalance(this.apiKey);
    return {
      limit: data.dataLimit,
      used: data.dataUsed,
      remaining: data.dataLimit - data.dataUsed,
    };
  }

  /** Get Filecoin deal status */
  async getDealStatus(cid: CID): Promise<unknown[]> {
    const { data } = await lighthouse.dealStatus(cid);
    return data;
  }

  // ─────────────────────────────────────────────────────────────
  // ENCRYPTION (requires wallet signature)
  // ─────────────────────────────────────────────────────────────

  /** Upload encrypted file */
  async uploadEncrypted(
    data: File | Buffer | string,
    auth: EncryptionAuth
  ): Promise<UploadResponse> {
    const result = await lighthouse.uploadEncrypted(data, this.apiKey, auth.publicKey, auth.signedMessage);
    return this.parseUploadResult(result.data[0]);
  }

  /** Decrypt and download encrypted file */
  async decrypt(cid: CID, auth: EncryptionAuth): Promise<ArrayBuffer> {
    const { data } = await lighthouse.fetchEncryptionKey(cid, auth.publicKey, auth.signedMessage);
    if (!data.key) throw new Error('Access denied: unable to fetch encryption key');
    return lighthouse.decryptFile(cid, data.key);
  }

  /** Share encrypted file with addresses */
  async shareAccess(cid: CID, addresses: string[], auth: EncryptionAuth): Promise<void> {
    await lighthouse.shareFile(auth.publicKey, addresses, cid, auth.signedMessage);
  }

  /** Revoke access from addresses */
  async revokeAccess(cid: CID, addresses: string | string[], auth: EncryptionAuth): Promise<void> {
    await lighthouse.revokeFileAccess(auth.publicKey, addresses, cid, auth.signedMessage);
  }

  /** Apply token-gating conditions */
  async applyAccessCondition(
    cid: CID,
    conditions: AccessCondition[],
    aggregator: string,
    auth: EncryptionAuth
  ): Promise<void> {
    await lighthouse.applyAccessCondition(auth.publicKey, cid, auth.signedMessage, conditions, aggregator);
  }

  /** Get access conditions for encrypted file */
  async getAccessConditions(cid: CID): Promise<{
    conditions: AccessCondition[];
    aggregator: string;
    sharedTo: string[];
  }> {
    const { data } = await lighthouse.getAccessConditions(cid);
    return data;
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────

  private parseUploadResult(data: { Name: string; Hash: string; Size: string }): UploadResponse {
    return { name: data.Name, cid: data.Hash, size: Number(data.Size) };
  }
}
