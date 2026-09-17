import { describe, expect, it, vi } from 'vitest';
import {
  clearComposerCoverPhoto,
  collapseComposerMediaToCoverImage,
  findComposerCoverImageIndex,
  replaceComposerCoverPhoto,
} from './composer-article-cover-media';

vi.mock('@/lib/post-media', () => ({
  isPostImageMime: (mime: string) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(mime.toLowerCase()),
  postMediaLocalPreviewUrl: (file: File) => `blob:${file.name}`,
  postMediaRevokeLocalPreviewUrl: vi.fn(),
}));

function file(name: string, type: string) {
  return new File([name], name, { type });
}

describe('composer article cover media', () => {
  it('finds the first still as the cover', () => {
    expect(
      findComposerCoverImageIndex([
        { url: 'a', mime: 'video/mp4' },
        { url: 'b', mime: 'image/jpeg' },
        { url: 'c', mime: 'image/png' },
      ])
    ).toBe(1);
  });

  it('collapses attachments to the cover still', () => {
    const jpeg = file('a.jpg', 'image/jpeg');
    const mp4 = file('b.mp4', 'video/mp4');
    expect(
      collapseComposerMediaToCoverImage({
        files: [mp4, jpeg],
        previews: [
          { url: 'v', mime: 'video/mp4' },
          { url: 'i', mime: 'image/jpeg' },
        ],
      })
    ).toEqual({
      files: [jpeg],
      previews: [{ url: 'i', mime: 'image/jpeg' }],
    });
  });

  it('replaces prior media with the cover photo', () => {
    const next = file('cover.png', 'image/png');
    const prior = file('old.jpg', 'image/jpeg');
    expect(
      replaceComposerCoverPhoto({
        files: [prior],
        previews: [{ url: 'old', mime: 'image/jpeg' }],
        file: next,
      })
    ).toEqual({
      files: [next],
      previews: [{ url: 'blob:cover.png', mime: 'image/png' }],
    });
  });

  it('clears media for the text-card face', () => {
    const prior = file('old.jpg', 'image/jpeg');
    expect(clearComposerCoverPhoto({ files: [prior] })).toEqual({
      files: [],
      previews: [],
    });
  });
});
