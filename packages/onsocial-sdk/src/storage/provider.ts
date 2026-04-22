// ---------------------------------------------------------------------------
// OnSocial SDK — storage providers
//
// A StorageProvider uploads bytes to IPFS (or any content-addressed store)
// and returns a MediaRef the SDK can embed in posts, profiles, or NFTs.
//
// Three built-in providers:
//   • GatewayProvider     — POST /storage/upload on the OnAPI gateway.
//                           Default. Partner's OnAPI key authorises it;
//                           the gateway holds the Lighthouse secret.
//   • LighthouseProvider  — Uploads directly to Lighthouse from the client
//                           using the dev's own Lighthouse API key. No
//                           OnAPI quota consumed; no gateway hop.
//   • Custom              — any object implementing `StorageProvider`.
//
// Callers that want to run purely on-contract (no OnAPI gateway at all) can
// combine `LighthouseProvider` (for media) with the action builders in
// `@onsocial/sdk/advanced` (for signing + submitting directly to NEAR).
// ---------------------------------------------------------------------------

import type { HttpClient } from '../http.js';
import type { MediaRef } from '../schema/v1.js';

/**
 * Result of a successful upload. All provider-knowable fields are populated;
 * renderer-hints like `width`, `height`, `alt`, `blurhash` may be filled in
 * by the caller before storing (e.g. after client-side image decoding).
 */
export interface UploadedMedia extends MediaRef {
  /** IPFS CID, always present and always content-addressed. */
  cid: string;
  /** Best-effort MIME. Providers fall back to `application/octet-stream`. */
  mime: string;
  /** Bytes stored. Providers MUST populate this. */
  size: number;
}

/** Narrow subset suitable for JSON/metadata uploads. */
export interface UploadedJson extends UploadedMedia {
  mime: 'application/json' | string;
}

export interface StorageProvider {
  /** Upload a single blob/file and return a MediaRef with `cid`, `mime`, `size`. */
  upload(file: Blob | File, opts?: UploadOptions): Promise<UploadedMedia>;
  /** Upload arbitrary JSON; returns a ref the caller can link into a post body. */
  uploadJson(data: unknown, opts?: UploadOptions): Promise<UploadedJson>;
  /** Resolve a CID to a fetchable gateway URL. */
  url(cid: string): string;
}

export interface UploadOptions {
  /** Per-call override for progress, abort, etc. */
  signal?: AbortSignal;
  /** Optional filename hint when uploading a raw Blob. */
  filename?: string;
}

// ── probeFile ──────────────────────────────────────────────────────────────

/**
 * Extract provider-independent metadata from a File/Blob. Runs in both
 * browser and Node.js (Node ≥18 has `Blob`). `mime` falls back to
 * `application/octet-stream` when the platform gives us nothing.
 */
export function probeFile(file: Blob | File): { mime: string; size: number } {
  const mime =
    (typeof file.type === 'string' && file.type.length > 0
      ? file.type
      : 'application/octet-stream') || 'application/octet-stream';
  const size = typeof file.size === 'number' ? file.size : 0;
  return { mime, size };
}

// ── GatewayProvider ────────────────────────────────────────────────────────

/**
 * Default provider — uploads through the OnAPI gateway. The gateway holds
 * the Lighthouse API key; the partner's OnAPI key authenticates the call.
 */
export class GatewayProvider implements StorageProvider {
  constructor(private _http: HttpClient) {}

  async upload(
    file: Blob | File,
    _opts?: UploadOptions
  ): Promise<UploadedMedia> {
    const probed = probeFile(file);
    const form = new FormData();
    const name =
      _opts?.filename ??
      (file instanceof File && file.name ? file.name : 'upload');
    form.append('file', file, name);
    const res = await this._http.requestForm<{
      cid: string;
      size?: number | string;
      mime?: string;
    }>('POST', '/storage/upload', form);
    const size =
      typeof res.size === 'string'
        ? Number(res.size)
        : typeof res.size === 'number'
          ? res.size
          : probed.size;
    return {
      cid: res.cid,
      mime: res.mime ?? probed.mime,
      size: Number.isFinite(size) ? size : probed.size,
    };
  }

  async uploadJson(data: unknown): Promise<UploadedJson> {
    const res = await this._http.post<{
      cid: string;
      size?: number | string;
      mime?: string;
    }>('/storage/upload-json', data);
    const bytes =
      typeof res.size === 'string'
        ? Number(res.size)
        : typeof res.size === 'number'
          ? res.size
          : typeof TextEncoder !== 'undefined'
            ? new TextEncoder().encode(JSON.stringify(data)).length
            : 0;
    return {
      cid: res.cid,
      mime: res.mime ?? 'application/json',
      size: Number.isFinite(bytes) ? bytes : 0,
    };
  }

  url(cid: string): string {
    return `https://gateway.lighthouse.storage/ipfs/${cid}`;
  }
}

// ── LighthouseProvider ─────────────────────────────────────────────────────

/**
 * Direct-to-Lighthouse provider. Uploads from the client using the dev's
 * own API key — no OnAPI gateway hop, no OnAPI quota. Useful for:
 *   • partners who want storage billed to their own Lighthouse account
 *   • contract-direct devs who don't use the OnAPI gateway at all
 *
 * Works in any environment with `fetch` + `FormData` (browsers, Deno, Node 18+).
 * The API key is sent to node.lighthouse.storage directly — keep it in env
 * vars, don't ship it in public client code unless your key is scoped to
 * append-only uploads.
 */
export class LighthouseProvider implements StorageProvider {
  private static readonly ENDPOINT =
    'https://node.lighthouse.storage/api/v0/add';
  private static readonly JSON_ENDPOINT =
    'https://node.lighthouse.storage/api/v0/add';
  private static readonly GATEWAY = 'https://gateway.lighthouse.storage/ipfs';

  constructor(
    private readonly _apiKey: string,
    private readonly _fetch: typeof globalThis.fetch = globalThis.fetch
  ) {
    if (!_apiKey || typeof _apiKey !== 'string') {
      throw new Error('LighthouseProvider: apiKey is required');
    }
  }

  async upload(
    file: Blob | File,
    opts?: UploadOptions
  ): Promise<UploadedMedia> {
    const probed = probeFile(file);
    const form = new FormData();
    const name =
      opts?.filename ??
      (file instanceof File && file.name ? file.name : 'upload');
    form.append('file', file, name);
    const res = await this._fetch(LighthouseProvider.ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this._apiKey}` },
      body: form,
      signal: opts?.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `LighthouseProvider.upload: HTTP ${res.status} ${body.slice(0, 200)}`
      );
    }
    // Lighthouse returns: { Name, Hash, Size } (Size as stringified bytes).
    const json = (await res.json()) as {
      Name?: string;
      Hash: string;
      Size?: string | number;
    };
    if (!json || typeof json.Hash !== 'string' || json.Hash.length === 0) {
      throw new Error('LighthouseProvider.upload: missing CID in response');
    }
    const size =
      typeof json.Size === 'string'
        ? Number(json.Size)
        : typeof json.Size === 'number'
          ? json.Size
          : probed.size;
    return {
      cid: json.Hash,
      mime: probed.mime,
      size: Number.isFinite(size) ? size : probed.size,
    };
  }

  async uploadJson(data: unknown): Promise<UploadedJson> {
    const body = JSON.stringify(data);
    const blob = new Blob([body], { type: 'application/json' });
    const uploaded = await this.upload(blob, { filename: 'metadata.json' });
    return { ...uploaded, mime: 'application/json' };
  }

  url(cid: string): string {
    return `${LighthouseProvider.GATEWAY}/${cid}`;
  }
}

// ── resolver ───────────────────────────────────────────────────────────────

export type StorageConfig =
  | StorageProvider
  | { provider: 'gateway' }
  | { provider: 'lighthouse'; apiKey: string }
  | { provider: 'custom'; impl: StorageProvider };

/**
 * Resolve a `storage` config value into a concrete provider. Defaults to
 * `GatewayProvider` when nothing is supplied. Exported for advanced callers
 * that want to instantiate a provider without going through `OnSocial`.
 */
export function resolveStorageProvider(
  config: StorageConfig | undefined,
  http: HttpClient
): StorageProvider {
  if (!config) return new GatewayProvider(http);
  if (isProvider(config)) return config;
  switch (config.provider) {
    case 'gateway':
      return new GatewayProvider(http);
    case 'lighthouse':
      return new LighthouseProvider(config.apiKey);
    case 'custom':
      return config.impl;
    default:
      return new GatewayProvider(http);
  }
}

function isProvider(v: unknown): v is StorageProvider {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as StorageProvider).upload === 'function' &&
    typeof (v as StorageProvider).uploadJson === 'function' &&
    typeof (v as StorageProvider).url === 'function'
  );
}
