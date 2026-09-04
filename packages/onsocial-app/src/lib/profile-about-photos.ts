import { resolveProfileMediaUrl } from '@/lib/profile-display';

/** About gallery — wide / pair / trio. */
export const PROFILE_ABOUT_PHOTOS_MAX = 3;

const PHOTO_ACCEPT = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export const PROFILE_ABOUT_PHOTO_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif';

export type ProfileAboutPhoto = {
  ref: string;
  url: string;
};

/** Chain-stored `profile/photos` — strings only, max 3. */
export function parseProfileAboutPhotoRefs(raw: unknown): string[] {
  let values: unknown[] = [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      values = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    values = raw;
  }

  const refs: string[] = [];
  for (const item of values) {
    if (typeof item !== 'string') continue;
    const ref = item.trim();
    if (!ref) continue;
    refs.push(ref);
    if (refs.length >= PROFILE_ABOUT_PHOTOS_MAX) break;
  }
  return refs;
}

export function profileAboutPhotosFromStored(
  photos?: string[] | null,
  extraPhotos?: string | null
): ProfileAboutPhoto[] {
  const refs = parseProfileAboutPhotoRefs(photos ?? extraPhotos ?? []);
  const out: ProfileAboutPhoto[] = [];
  for (const ref of refs) {
    const url = resolveProfileMediaUrl(ref);
    if (!url) continue;
    out.push({ ref, url });
  }
  return out;
}

export function profileAboutPhotoUrls(photos?: ProfileAboutPhoto[] | null): string[] {
  return (photos ?? []).map((photo) => photo.url).filter(Boolean);
}

export function profileAboutPhotoRefsEqual(
  left: string[],
  right: string[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((ref, index) => ref === right[index]);
}

export function profileAboutPhotoKey(
  photo: { ref: string; key?: string },
  index: number
): string {
  return photo.key || photo.ref || `photo-${index}`;
}

export function moveProfileAboutPhoto<T>(
  photos: T[],
  from: number,
  to: number
): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= photos.length ||
    to >= photos.length
  ) {
    return photos;
  }
  const next = photos.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return photos;
  next.splice(to, 0, item);
  return next;
}

/** Swap two stills in place (click-to-swap in the About studio). */
export function swapProfileAboutPhoto<T>(
  photos: T[],
  left: number,
  right: number
): T[] {
  if (
    left === right ||
    left < 0 ||
    right < 0 ||
    left >= photos.length ||
    right >= photos.length
  ) {
    return photos;
  }
  const next = photos.slice();
  const a = next[left];
  const b = next[right];
  if (a === undefined || b === undefined) return photos;
  next[left] = b;
  next[right] = a;
  return next;
}

export function isProfileAboutPhotoFile(file: File | null | undefined): boolean {
  if (!file) return false;
  return PHOTO_ACCEPT.has(file.type);
}
