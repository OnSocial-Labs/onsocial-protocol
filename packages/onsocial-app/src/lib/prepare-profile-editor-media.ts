import {
  isMediaFramePanCentered,
  MEDIA_FRAME_PAN_CENTER,
  type MediaFramePan,
} from '@/lib/media-frame-pan';
import {
  COVER_JPEG_BANNER,
  COVER_JPEG_FILM,
  COVER_JPEG_PRINT,
  COVER_JPEG_SQUARE,
  prepareCoverJpeg,
} from '@/lib/prepare-cover-jpeg';
import type { ProfileAboutPhotoDraft } from '@/lib/profile-about-photos';

export async function prepareProfileAvatarForSave(input: {
  file: File | null;
  displayUrl: string | null;
  pan: MediaFramePan;
  removed: boolean;
}): Promise<File | null | undefined> {
  if (input.removed) return null;
  const needsBake = Boolean(input.file) || !isMediaFramePanCentered(input.pan);
  if (!needsBake) return undefined;
  const source = input.file ?? input.displayUrl;
  if (!source) return undefined;
  return prepareCoverJpeg(
    source,
    COVER_JPEG_SQUARE,
    input.pan ?? MEDIA_FRAME_PAN_CENTER,
    'avatar.jpg'
  );
}

export async function prepareProfileBannerForSave(input: {
  file: File | null;
  displayUrl: string | null;
  pan: MediaFramePan;
  removed: boolean;
  /** Video banners skip cover bake. */
  isVideo: boolean;
}): Promise<File | null | undefined> {
  if (input.removed) return null;
  if (input.isVideo) {
    return input.file ?? undefined;
  }
  const needsBake = Boolean(input.file) || !isMediaFramePanCentered(input.pan);
  if (!needsBake) return undefined;
  const source = input.file ?? input.displayUrl;
  if (!source) return undefined;
  return prepareCoverJpeg(
    source,
    COVER_JPEG_BANNER,
    input.pan ?? MEDIA_FRAME_PAN_CENTER,
    'banner.jpg'
  );
}

export async function prepareProfileAboutPhotosForSave(
  photos: ProfileAboutPhotoDraft[]
): Promise<{
  photos: ProfileAboutPhotoDraft[];
  photoFiles: Array<File | null>;
}> {
  const nextPhotos: ProfileAboutPhotoDraft[] = [];
  const photoFiles: Array<File | null> = [];

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    if (!photo) continue;
    const pan = photo.pan ?? MEDIA_FRAME_PAN_CENTER;
    const needsBake = Boolean(photo.file) || !isMediaFramePanCentered(pan);
    if (!needsBake) {
      nextPhotos.push(photo);
      photoFiles.push(null);
      continue;
    }
    const source = photo.file ?? photo.url;
    const aspect = index === 0 ? COVER_JPEG_PRINT : COVER_JPEG_FILM;
    const baked = await prepareCoverJpeg(
      source,
      aspect,
      pan,
      index === 0 ? 'print.jpg' : `film-${index}.jpg`
    );
    nextPhotos.push({
      ...photo,
      file: baked,
      pan: MEDIA_FRAME_PAN_CENTER,
    });
    photoFiles.push(baked);
  }

  return { photos: nextPhotos, photoFiles };
}
