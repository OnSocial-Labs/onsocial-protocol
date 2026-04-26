// ---------------------------------------------------------------------------
// OnSocial SDK — storage module (IPFS via Lighthouse)
//
// Thin convenience wrapper over a StorageProvider. By default uploads go
// through the OnAPI gateway (`/storage/upload`), but passing a custom
// provider — e.g. `LighthouseProvider` for direct-to-Lighthouse — lets
// devs bypass the gateway entirely.
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type { StorageUploadResponse } from './types.js';
import {
  GatewayProvider,
  type StorageProvider,
  type UploadedMedia,
  type UploadedJson,
} from './storage/provider.js';

export class StorageModule {
  private _provider: StorageProvider;

  constructor(
    private _http: HttpClient,
    provider?: StorageProvider
  ) {
    this._provider = provider ?? new GatewayProvider(_http);
  }

  /**
   * Upload a file to IPFS via the configured provider.
   *
   * ```ts
   * const { cid } = await os.storage.upload(file);
   * const url = os.storage.url(cid);
   * ```
   */
  async upload(file: Blob | File): Promise<StorageUploadResponse> {
    const res: UploadedMedia = await this._provider.upload(file);
    return {
      cid: res.cid,
      size: res.size,
      mime: res.mime,
    } as StorageUploadResponse;
  }

  /**
   * Upload JSON metadata to IPFS via the configured provider.
   *
   * ```ts
   * const { cid } = await os.storage.uploadJson({ name: 'My NFT', ... });
   * ```
   */
  async uploadJson(data: unknown): Promise<StorageUploadResponse> {
    const res: UploadedJson = await this._provider.uploadJson(data);
    return {
      cid: res.cid,
      size: res.size,
      mime: res.mime,
    } as StorageUploadResponse;
  }

  /**
   * Upload many files in parallel, preserving order. Bounded concurrency
   * (default 4) keeps the gateway/Lighthouse from throttling on large
   * batches. Returns one `StorageUploadResponse` per input file at the
   * matching index.
   *
   * ```ts
   * const refs = await os.storage.uploadMany(files, { concurrency: 6 });
   * await os.posts.create({ text: 'gallery', media: refs });
   * ```
   *
   * Pass `onProgress` to drive a UI counter:
   *
   * ```ts
   * await os.storage.uploadMany(files, {
   *   onProgress: (done, total) => setLabel(`${done}/${total}`),
   * });
   * ```
   */
  async uploadMany(
    files: Array<Blob | File>,
    opts: {
      concurrency?: number;
      onProgress?: (done: number, total: number) => void;
    } = {}
  ): Promise<StorageUploadResponse[]> {
    if (files.length === 0) return [];
    const concurrency = Math.max(1, opts.concurrency ?? 4);
    const total = files.length;
    const results: StorageUploadResponse[] = new Array(total);
    let done = 0;
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < total) {
        const idx = cursor++;
        results[idx] = await this.upload(files[idx]);
        done += 1;
        opts.onProgress?.(done, total);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, total) }, () =>
      worker()
    );
    await Promise.all(workers);
    return results;
  }

  /** Get the gateway URL for a CID. */
  url(cid: string): string {
    return this._provider.url(cid);
  }

  /** The underlying provider (for advanced usage — custom upload flows). */
  get provider(): StorageProvider {
    return this._provider;
  }

  /** Fetch stored JSON by CID (via the gateway; independent of provider). */
  async getJson<T = unknown>(cid: string): Promise<T> {
    return this._http.get<T>(`/storage/${encodeURIComponent(cid)}/json`);
  }

  /** Check storage service health (via the gateway). */
  async health(): Promise<{ status: string; gateway: string }> {
    return this._http.get('/storage/health');
  }
}
