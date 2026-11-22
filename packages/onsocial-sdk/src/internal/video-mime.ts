// Filename fallback when a browser leaves video File.type empty (or octet-stream).
// Capture uses this so an .mp4 still gets a poster; the stored mime stays whatever
// the storage provider returns.

const VIDEO_EXT_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
};

function blobName(blob: Blob): string {
  if (typeof File !== 'undefined' && blob instanceof File) return blob.name;
  const named = blob as Blob & { name?: unknown };
  return typeof named.name === 'string' ? named.name : '';
}

/** `video/*` from the blob type, or inferred from the filename when type is empty. */
export function videoMimeForBlob(blob: Blob): string | null {
  const typed = (blob.type || '').trim().toLowerCase();
  if (typed.startsWith('video/')) return typed;
  if (typed && typed !== 'application/octet-stream') return null;
  const name = blobName(blob).toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return VIDEO_EXT_MIME[name.slice(dot + 1)] ?? null;
}
