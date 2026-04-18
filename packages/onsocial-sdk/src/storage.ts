// ---------------------------------------------------------------------------
// OnSocial SDK — storage module (IPFS via Lighthouse)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type { StorageUploadResponse } from './types.js';

export class StorageModule {
  constructor(private _http: HttpClient) {}

  /**
   * Upload a file to IPFS.
   *
   * ```ts
   * const { cid } = await os.storage.upload(file);
   * const url = os.storage.url(cid);
   * ```
   */
  async upload(file: Blob | File): Promise<StorageUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return this._http.requestForm<StorageUploadResponse>(
      'POST',
      '/storage/upload',
      form
    );
  }

  /**
   * Upload JSON metadata to IPFS.
   *
   * ```ts
   * const { cid } = await os.storage.uploadJson({ name: 'My NFT', ... });
   * ```
   */
  async uploadJson(data: unknown): Promise<StorageUploadResponse> {
    return this._http.post<StorageUploadResponse>('/storage/upload-json', data);
  }

  /** Get the gateway URL for a CID. */
  url(cid: string): string {
    return `https://gateway.lighthouse.storage/ipfs/${cid}`;
  }

  /** Fetch stored JSON by CID. */
  async getJson<T = unknown>(cid: string): Promise<T> {
    return this._http.get<T>(`/storage/${encodeURIComponent(cid)}/json`);
  }

  /** Check storage service health (public). */
  async health(): Promise<{ status: string; gateway: string }> {
    return this._http.get('/storage/health');
  }
}
