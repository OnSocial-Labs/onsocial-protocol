// src/storage/client.ts
// Main StorageClient class for IPFS/Lighthouse storage

import type {
  CID,
  UploadResponse,
  UploadOptions,
  UploadTextOptions,
  StorageClientConfig,
  FileInfo,
  StorageBalance,
} from './types';
import {
  uploadBuffer,
  uploadText,
  downloadFromGateway,
  getFileInfo as lighthouseGetFileInfo,
  getUploads,
  deleteFile,
  getBalance,
  LIGHTHOUSE_GATEWAY,
} from './lighthouse';

/**
 * StorageClient - IPFS/Lighthouse storage for OnSocial
 *
 * Handles media and document uploads to decentralized storage.
 * Returns CIDs that can be stored on-chain via the contract.
 *
 * @example
 * ```ts
 * const storage = new StorageClient({ apiKey: 'xxx' });
 *
 * // Upload media
 * const { cid } = await storage.upload(imageFile);
 *
 * // Store CID on-chain
 * await contract.set({ data: { 'alice.near/profile/avatar': cid } });
 *
 * // Download
 * const data = await storage.download(cid);
 * ```
 */
export class StorageClient {
  private apiKey: string;
  private gatewayUrl: string;

  constructor(config: StorageClientConfig) {
    if (!config.apiKey) {
      throw new Error('StorageClient requires an API key');
    }
    this.apiKey = config.apiKey;
    this.gatewayUrl = config.gatewayUrl || LIGHTHOUSE_GATEWAY;
  }

  /**
   * Upload a file/buffer to IPFS
   *
   * @param data - File, Blob, ArrayBuffer, Uint8Array, or Buffer
   * @param options - Upload options (name, mimeType, onProgress)
   * @returns Upload response with CID
   *
   * @example
   * ```ts
   * // Browser: File input
   * const { cid } = await storage.upload(fileInput.files[0]);
   *
   * // Node: Buffer
   * const { cid } = await storage.upload(Buffer.from(imageData));
   *
   * // With progress
   * const { cid } = await storage.upload(file, {
   *   onProgress: (p) => console.log(`${p}%`)
   * });
   * ```
   */
  async upload(
    data: File | Blob | ArrayBuffer | Uint8Array,
    options: UploadOptions = {}
  ): Promise<UploadResponse> {
    let buffer: ArrayBuffer;
    let name = options.name;

    // Convert to ArrayBuffer
    if (data instanceof File) {
      buffer = await data.arrayBuffer();
      name = name || data.name;
    } else if (data instanceof Blob) {
      buffer = await data.arrayBuffer();
    } else if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (data instanceof Uint8Array) {
      // Use ArrayBuffer.prototype.slice to ensure we get ArrayBuffer, not SharedArrayBuffer
      buffer = new Uint8Array(data).buffer as ArrayBuffer;
    } else {
      // Assume Buffer (Node.js) - copy to new ArrayBuffer
      const nodeBuffer = data as Buffer;
      buffer = new Uint8Array(nodeBuffer).buffer as ArrayBuffer;
    }

    const result = await uploadBuffer(buffer, this.apiKey, name, options.onProgress);

    return {
      name: result.Name,
      cid: result.Hash,
      size: parseInt(result.Size, 10),
    };
  }

  /**
   * Upload text content to IPFS
   *
   * @param text - Text or JSON string to upload
   * @param options - Upload options (name)
   * @returns Upload response with CID
   *
   * @example
   * ```ts
   * // Upload text
   * const { cid } = await storage.uploadText('Hello, OnSocial!');
   *
   * // Upload JSON
   * const { cid } = await storage.uploadJSON({ post: 'content' });
   * ```
   */
  async uploadText(text: string, options: UploadTextOptions = {}): Promise<UploadResponse> {
    const result = await uploadText(text, this.apiKey, options.name);

    return {
      name: result.Name,
      cid: result.Hash,
      size: parseInt(result.Size, 10),
    };
  }

  /**
   * Upload JSON object to IPFS
   *
   * @param data - Object to serialize and upload
   * @param options - Upload options (name)
   * @returns Upload response with CID
   *
   * @example
   * ```ts
   * const { cid } = await storage.uploadJSON({
   *   type: 'post',
   *   content: 'Hello world',
   *   media: ['bafybeig...'],
   * });
   * ```
   */
  async uploadJSON(data: unknown, options: UploadTextOptions = {}): Promise<UploadResponse> {
    const json = JSON.stringify(data);
    return this.uploadText(json, { name: options.name || 'data.json' });
  }

  /**
   * Download content from IPFS by CID
   *
   * @param cid - IPFS Content Identifier
   * @returns Raw bytes as ArrayBuffer
   *
   * @example
   * ```ts
   * const data = await storage.download('bafybeig...');
   *
   * // Convert to text
   * const text = new TextDecoder().decode(data);
   *
   * // Convert to Blob for display
   * const blob = new Blob([data]);
   * const url = URL.createObjectURL(blob);
   * ```
   */
  async download(cid: CID): Promise<ArrayBuffer> {
    return downloadFromGateway(cid, this.gatewayUrl);
  }

  /**
   * Download and parse JSON from IPFS
   *
   * @param cid - IPFS Content Identifier
   * @returns Parsed JSON object
   *
   * @example
   * ```ts
   * const post = await storage.downloadJSON<Post>('bafybeig...');
   * console.log(post.content);
   * ```
   */
  async downloadJSON<T = unknown>(cid: CID): Promise<T> {
    const data = await this.download(cid);
    const text = new TextDecoder().decode(data);
    return JSON.parse(text) as T;
  }

  /**
   * Download as text from IPFS
   *
   * @param cid - IPFS Content Identifier
   * @returns Text content
   */
  async downloadText(cid: CID): Promise<string> {
    const data = await this.download(cid);
    return new TextDecoder().decode(data);
  }

  /**
   * Get the gateway URL for a CID (for direct linking)
   *
   * @param cid - IPFS Content Identifier
   * @returns Full gateway URL
   *
   * @example
   * ```ts
   * const url = storage.getUrl('bafybeig...');
   * // 'https://gateway.lighthouse.storage/ipfs/bafybeig...'
   *
   * // Use in img tag
   * <img src={storage.getUrl(avatarCid)} />
   * ```
   */
  getUrl(cid: CID): string {
    return `${this.gatewayUrl}/ipfs/${cid}`;
  }

  /**
   * Get file info for a CID
   *
   * @param cid - IPFS Content Identifier
   * @returns File metadata
   */
  async getFileInfo(cid: CID): Promise<FileInfo> {
    const info = await lighthouseGetFileInfo(cid, this.apiKey);
    return {
      cid: info.cid,
      fileName: info.fileName,
      mimeType: info.mimeType,
      fileSizeInBytes: parseInt(info.fileSizeInBytes, 10),
      createdAt: 0, // Not returned by this endpoint
      encryption: info.encryption,
    };
  }

  /**
   * List uploaded files
   *
   * @param lastKey - Pagination cursor (optional)
   * @returns List of uploaded files
   */
  async listUploads(lastKey?: string): Promise<{
    files: FileInfo[];
    totalFiles: number;
  }> {
    const result = await getUploads(this.apiKey, lastKey || null);
    return {
      files: result.fileList.map((f) => ({
        cid: f.cid,
        fileName: f.fileName,
        mimeType: f.mimeType,
        fileSizeInBytes: parseInt(f.fileSizeInBytes, 10),
        createdAt: f.createdAt,
        encryption: f.encryption,
      })),
      totalFiles: result.totalFiles,
    };
  }

  /**
   * Delete a file by its ID (not CID)
   *
   * @param fileId - File ID from listUploads
   */
  async delete(fileId: string): Promise<void> {
    await deleteFile(this.apiKey, fileId);
  }

  /**
   * Get storage usage/balance
   *
   * @returns Storage balance info
   */
  async getBalance(): Promise<StorageBalance> {
    const data = await getBalance(this.apiKey);
    return {
      dataLimit: data.dataLimit,
      dataUsed: data.dataUsed,
      remaining: data.dataLimit - data.dataUsed,
    };
  }
}
