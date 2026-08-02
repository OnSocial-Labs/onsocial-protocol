import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

const LIGHTHOUSE_NODE_URL =
  process.env.LIGHTHOUSE_NODE_URL || 'https://upload.lighthouse.storage';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/json': 'json',
  'text/plain': 'txt',
};

export interface LighthouseUploadData {
  Hash: string;
  Size?: string | number;
  Name?: string;
}

export interface LighthouseBufferUploadOptions {
  buffer: Buffer | Uint8Array;
  apiKey: string;
  filename?: string | null;
  mime?: string | null;
  storageType?: string;
  cidVersion?: number;
  endpointBase?: string;
  fetchImpl?: typeof fetch;
}

function extensionForMime(mime?: string | null): string | null {
  if (!mime) return null;
  return MIME_EXTENSIONS[mime.toLowerCase()] ?? null;
}

export function filenameForLighthouse(
  filename?: string | null,
  mime?: string | null,
  fallbackBase = 'upload'
): string {
  const raw = filename?.split(/[\\/]/).pop()?.trim() || fallbackBase;
  const withoutControlChars = Array.from(raw)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  const sanitized = withoutControlChars
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  const base = sanitized || fallbackBase;

  if (/\.[A-Za-z0-9]{1,10}$/.test(base)) return base;

  const ext = extensionForMime(mime);
  return ext ? `${base}.${ext}` : base;
}

async function parseLighthouseError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  if (!body) return response.statusText || 'Lighthouse upload failed';

  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    const message = parsed.error ?? parsed.message;
    if (typeof message === 'string' && message) return message;
  } catch {
    // Fall through to body snippet.
  }

  return body.slice(0, 300);
}

export interface LighthouseDirectoryFile {
  buffer: Buffer | Uint8Array;
  filename: string;
  mime?: string | null;
}

export interface LighthouseDirectoryUploadOptions {
  files: LighthouseDirectoryFile[];
  apiKey: string;
  storageType?: string;
  cidVersion?: number;
  endpointBase?: string;
  fetchImpl?: typeof fetch;
}

export interface LighthouseDirectoryUploadData {
  /** CID of the wrapping directory — file N resolves at `<dirCid>/<filename>`. */
  dirHash: string;
  entries: LighthouseUploadData[];
}

/**
 * Upload multiple files wrapped in a single IPFS directory
 * (`wrap-with-directory=true`), so every file resolves under one
 * content-addressed root: `ipfs://<dirHash>/<filename>`.
 *
 * Used by variation drops: the directory CID commits the full art set
 * before the first mint.
 */
export async function uploadNamedBuffersAsDirectoryToLighthouse({
  files,
  apiKey,
  storageType,
  cidVersion = 1,
  endpointBase = LIGHTHOUSE_NODE_URL,
  fetchImpl = fetch,
}: LighthouseDirectoryUploadOptions): Promise<LighthouseDirectoryUploadData> {
  if (files.length === 0) {
    throw new Error('Directory upload requires at least one file');
  }

  const endpoint = `${endpointBase.replace(/\/+$/, '')}/api/v0/add?cid-version=${cidVersion}&wrap-with-directory=true`;
  const formData = new FormData();
  for (const file of files) {
    const bytes = new Uint8Array(file.buffer);
    const blob = new Blob([bytes], {
      type: file.mime || 'application/octet-stream',
    });
    formData.append(
      'file',
      blob,
      filenameForLighthouse(file.filename, file.mime)
    );
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(storageType ? { 'X-Storage-Type': storageType } : {}),
    },
  });

  if (!response.ok) {
    const details = await parseLighthouseError(response);
    throw new Error(
      `Lighthouse directory upload failed (${response.status}): ${details}`
    );
  }

  const entries = parseAddEntries(await response.text());
  // The wrapping directory is the entry with an empty Name (Kubo behaviour);
  // it is emitted last when absent-named entries are not distinguished.
  const dirEntry =
    entries.find((entry) => !entry.Name) ?? entries[entries.length - 1];
  if (!dirEntry?.Hash) {
    throw new Error(
      'Lighthouse directory upload failed: missing directory CID in response'
    );
  }

  return { dirHash: dirEntry.Hash, entries };
}

export interface LighthouseDiskFile {
  /** Absolute path of the file on local disk. */
  path: string;
  filename: string;
  mime?: string | null;
}

export interface LighthouseDiskDirectoryUploadOptions {
  files: LighthouseDiskFile[];
  apiKey: string;
  storageType?: string;
  cidVersion?: number;
  endpointBase?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Stream files from disk into one IPFS directory upload.
 *
 * Unlike `uploadNamedBuffersAsDirectoryToLighthouse`, the multipart body is
 * produced as an async generator that reads one file at a time, so a large
 * generated set (thousands of PNGs, gigabytes total) never has to fit in
 * process memory.
 */
export async function uploadDirectoryFromDiskToLighthouse({
  files,
  apiKey,
  storageType,
  cidVersion = 1,
  endpointBase = LIGHTHOUSE_NODE_URL,
  fetchImpl = fetch,
}: LighthouseDiskDirectoryUploadOptions): Promise<LighthouseDirectoryUploadData> {
  if (files.length === 0) {
    throw new Error('Directory upload requires at least one file');
  }

  const endpoint = `${endpointBase.replace(/\/+$/, '')}/api/v0/add?cid-version=${cidVersion}&wrap-with-directory=true`;
  const boundary = `----onsocial-dir-${randomUUID()}`;

  async function* multipartBody(): AsyncGenerator<Buffer> {
    for (const file of files) {
      const name = filenameForLighthouse(file.filename, file.mime);
      const contentType = file.mime || 'application/octet-stream';
      yield Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${name}"\r\n` +
          `Content-Type: ${contentType}\r\n\r\n`
      );
      for await (const chunk of createReadStream(file.path)) {
        yield chunk as Buffer;
      }
      yield Buffer.from('\r\n');
    }
    yield Buffer.from(`--${boundary}--\r\n`);
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    body: Readable.toWeb(Readable.from(multipartBody())) as unknown as BodyInit,
    // Node fetch requires half-duplex for streamed request bodies.
    ...({ duplex: 'half' } as Record<string, unknown>),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      ...(storageType ? { 'X-Storage-Type': storageType } : {}),
    },
  });

  if (!response.ok) {
    const details = await parseLighthouseError(response);
    throw new Error(
      `Lighthouse directory upload failed (${response.status}): ${details}`
    );
  }

  const entries = parseAddEntries(await response.text());
  const dirEntry =
    entries.find((entry) => !entry.Name) ?? entries[entries.length - 1];
  if (!dirEntry?.Hash) {
    throw new Error(
      'Lighthouse directory upload failed: missing directory CID in response'
    );
  }

  return { dirHash: dirEntry.Hash, entries };
}

/** Parse an IPFS `add` response — single JSON object, JSON array, or NDJSON. */
function parseAddEntries(text: string): LighthouseUploadData[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as
      | LighthouseUploadData
      | LighthouseUploadData[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LighthouseUploadData);
  }
}

export async function uploadNamedBufferToLighthouse({
  buffer,
  apiKey,
  filename,
  mime,
  storageType,
  cidVersion = 1,
  endpointBase = LIGHTHOUSE_NODE_URL,
  fetchImpl = fetch,
}: LighthouseBufferUploadOptions): Promise<LighthouseUploadData> {
  const endpoint = `${endpointBase.replace(/\/+$/, '')}/api/v0/add?cid-version=${cidVersion}`;
  const formData = new FormData();
  const uploadName = filenameForLighthouse(filename, mime);
  const contentType = mime || 'application/octet-stream';
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes], { type: contentType });
  formData.append('file', blob, uploadName);

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(storageType ? { 'X-Storage-Type': storageType } : {}),
    },
  });

  if (!response.ok) {
    const details = await parseLighthouseError(response);
    throw new Error(
      `Lighthouse upload failed (${response.status}): ${details}`
    );
  }

  const data = (await response.json()) as LighthouseUploadData;
  if (!data?.Hash) {
    throw new Error('Lighthouse upload failed: missing CID in response');
  }

  return data;
}
