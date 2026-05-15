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
