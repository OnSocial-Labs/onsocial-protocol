// src/storage/client.ts
// StorageClient - Uploads via onsocial-backend, downloads via IPFS gateway

import type { CID, UploadResponse, StorageClientConfig } from './types';

const DEFAULT_ENDPOINT = 'https://onsocial-backend.fly.dev/storage';
const DEFAULT_GATEWAY = 'https://gateway.lighthouse.storage';

/**
 * StorageClient - IPFS storage for OnSocial
 *
 * Uploads go through onsocial-backend (no API key needed).
 * Downloads go directly to IPFS gateway.
 *
 * @example
 * ```ts
 * const storage = new StorageClient();
 * const { cid } = await storage.upload(file);
 * const url = storage.getUrl(cid);
 * ```
 */
export class StorageClient {
  private endpoint: string;
  private gateway: string;

  constructor(config: StorageClientConfig = {}) {
    this.endpoint = config.endpoint || DEFAULT_ENDPOINT;
    this.gateway = config.gateway || DEFAULT_GATEWAY;
  }

  // ─────────────────────────────────────────────────────────────
  // UPLOAD (via backend)
  // ─────────────────────────────────────────────────────────────

  /** Upload file/blob to IPFS */
  async upload(data: File | Blob): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', data);

    const res = await fetch(`${this.endpoint}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    const result = await res.json();
    return {
      cid: result.cid,
      size: Number(result.size),
      name: data instanceof File ? data.name : 'blob',
    };
  }

  /** Upload JSON to IPFS */
  async uploadJSON(data: unknown): Promise<UploadResponse> {
    const res = await fetch(`${this.endpoint}/upload-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    const result = await res.json();
    return {
      cid: result.cid,
      size: Number(result.size),
      name: 'data.json',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // DOWNLOAD (direct from gateway)
  // ─────────────────────────────────────────────────────────────

  /** Download raw bytes from IPFS */
  async download(cid: CID): Promise<ArrayBuffer> {
    const res = await fetch(this.getUrl(cid));
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res.arrayBuffer();
  }

  /** Download and decode as text */
  async downloadText(cid: CID): Promise<string> {
    const data = await this.download(cid);
    return new TextDecoder().decode(data);
  }

  /** Download and parse as JSON */
  async downloadJSON<T = unknown>(cid: CID): Promise<T> {
    const text = await this.downloadText(cid);
    return JSON.parse(text) as T;
  }

  // ─────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────

  /** Get gateway URL for a CID */
  getUrl(cid: CID): string {
    return `${this.gateway}/ipfs/${cid}`;
  }
}
