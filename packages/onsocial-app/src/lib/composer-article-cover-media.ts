import {
  isPostImageMime,
  postMediaLocalPreviewUrl,
  postMediaRevokeLocalPreviewUrl,
} from '@/lib/post-media';

export type ComposerMediaPreview = { url: string; mime: string };

/** First still image — the article cover when present. */
export function findComposerCoverImageIndex(
  previews: readonly ComposerMediaPreview[]
): number {
  return previews.findIndex(
    (preview) =>
      isPostImageMime(preview.mime) || preview.mime.startsWith('image/')
  );
}

/**
 * Article media is the cover: keep at most the first still, drop everything
 * else (extra photos / video).
 */
export function collapseComposerMediaToCoverImage(input: {
  files: readonly File[];
  previews: readonly ComposerMediaPreview[];
}): { files: File[]; previews: ComposerMediaPreview[] } {
  const index = findComposerCoverImageIndex(input.previews);
  if (index < 0) {
    for (const file of input.files) postMediaRevokeLocalPreviewUrl(file);
    return { files: [], previews: [] };
  }
  input.files.forEach((file, fileIndex) => {
    if (fileIndex !== index) postMediaRevokeLocalPreviewUrl(file);
  });
  return {
    files: [input.files[index]!],
    previews: [input.previews[index]!],
  };
}

/** Replace or set the single cover photo; revokes any prior attachments. */
export function replaceComposerCoverPhoto(input: {
  files: readonly File[];
  previews: readonly ComposerMediaPreview[];
  file: File;
}): { files: File[]; previews: ComposerMediaPreview[] } {
  for (const file of input.files) postMediaRevokeLocalPreviewUrl(file);
  return {
    files: [input.file],
    previews: [
      {
        url: postMediaLocalPreviewUrl(input.file),
        mime: input.file.type || 'image/jpeg',
      },
    ],
  };
}

/** Drop the cover photo (and any other media) so the text card is the face. */
export function clearComposerCoverPhoto(input: {
  files: readonly File[];
}): { files: File[]; previews: ComposerMediaPreview[] } {
  for (const file of input.files) postMediaRevokeLocalPreviewUrl(file);
  return { files: [], previews: [] };
}
