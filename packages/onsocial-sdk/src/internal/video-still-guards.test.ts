import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGroupReplySetData } from '../builders/group-post.js';
import { resolvePostMedia } from '../builders/post.js';
import { captureBlobVideoPoster } from './media-poster.js';
import {
  POST_STORAGE_BUDGET_BYTES,
  socialStorageUsage,
} from './post-storage-budget.js';
import { validatePostV1 } from '../schema/v1.js';
import type { StorageProvider } from '../storage/provider.js';

vi.mock('./media-poster.js', () => ({
  captureBlobVideoPoster: vi.fn(async () => null),
}));

const posterMock = vi.mocked(captureBlobVideoPoster);

const PLATFORM_ALLOWANCE_MAX_BYTES = 6000;

const CID_V0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYg82mmvWDp5u4A8Wqzz';
const CID_V1 = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const POSTER_128 =
  'bafkqasyrceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceirceircei';

afterEach(() => {
  posterMock.mockReset().mockResolvedValue(null);
});

describe('video still guards', () => {
  it('keeps the video when the still upload throws', async () => {
    const clip = new File([Uint8Array.from([1])], 'clip.mp4', {
      type: 'video/mp4',
    });
    const provider = {
      upload: vi.fn(async (file: Blob | File) => {
        if (file.type === 'image/jpeg') throw new Error('still upload failed');
        return { cid: CID_V1, mime: file.type, size: file.size };
      }),
      uploadJson: vi.fn(),
      url: (cid: string) => `https://cdn/${cid}`,
    } as unknown as StorageProvider;
    posterMock.mockResolvedValue(
      new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/jpeg' })
    );

    const out = await resolvePostMedia(
      { text: 'clip', files: [clip] },
      provider
    );
    expect(out.media).toEqual([
      { cid: CID_V1, mime: 'video/mp4', size: clip.size },
    ]);
  });

  it('rejects a non-CID or over-128 poster and still writes the video', async () => {
    const over128 = `${CID_V1}${'a'.repeat(70)}`;
    expect(over128.length).toBeGreaterThan(128);
    expect(
      validatePostV1({
        v: 1,
        text: 'clip',
        timestamp: 1,
        media: [
          {
            cid: CID_V1,
            mime: 'video/mp4',
            poster: 'https://evil.example/x.jpg',
          },
        ],
      })
    ).toBe('post.media: media.poster must be a CID of at most 128 characters');
    expect(
      validatePostV1({
        v: 1,
        text: 'clip',
        timestamp: 1,
        media: [{ cid: CID_V1, mime: 'video/mp4', poster: over128 }],
      })
    ).toBe('post.media: media.poster must be a CID of at most 128 characters');
    expect(
      validatePostV1({
        v: 1,
        text: 'clip',
        timestamp: 1,
        media: [{ cid: CID_V1, mime: 'video/mp4', poster: CID_V0 }],
      })
    ).toBeNull();
    expect(POSTER_128.length).toBe(128);
    expect(
      validatePostV1({
        v: 1,
        text: 'clip',
        timestamp: 1,
        media: [{ cid: CID_V1, mime: 'video/mp4', poster: POSTER_128 }],
      })
    ).toBeNull();
    expect(
      validatePostV1({
        v: 1,
        text: 'clip',
        timestamp: 1,
        media: [{ cid: CID_V1, mime: 'video/mp4', poster: `ipfs://${CID_V1}` }],
      })
    ).toBeNull();

    const clip = new File([Uint8Array.from([1])], 'clip.mp4', {
      type: 'video/mp4',
    });
    const provider = {
      upload: vi.fn(async (file: Blob | File) => {
        if (file.type === 'image/jpeg') {
          return { cid: 'not a cid', mime: 'image/jpeg', size: file.size };
        }
        return { cid: CID_V1, mime: 'video/mp4', size: file.size };
      }),
      uploadJson: vi.fn(),
      url: (cid: string) => `https://cdn/${cid}`,
    } as unknown as StorageProvider;
    posterMock.mockResolvedValue(
      new Blob([Uint8Array.from([9])], { type: 'image/jpeg' })
    );
    const out = await resolvePostMedia(
      { text: 'clip', files: [clip] },
      provider
    );
    expect(out.media).toEqual([
      { cid: CID_V1, mime: 'video/mp4', size: clip.size },
    ]);

    const prefixed = {
      upload: vi.fn(async (file: Blob | File) => {
        if (file.type === 'image/jpeg') {
          return {
            cid: `ipfs://${CID_V0}`,
            mime: 'image/jpeg',
            size: file.size,
          };
        }
        return { cid: CID_V1, mime: 'video/mp4', size: file.size };
      }),
      uploadJson: vi.fn(),
      url: (cid: string) => `https://cdn/${cid}`,
    } as unknown as StorageProvider;
    const storedBare = await resolvePostMedia(
      { text: 'clip', files: [clip] },
      prefixed
    );
    expect(storedBare.media).toEqual([
      {
        cid: CID_V1,
        mime: 'video/mp4',
        size: clip.size,
        poster: CID_V0,
      },
    ]);
  });

  it('drops stills on a maximum composer post that would exceed the storage budget', () => {
    const groupId = 'g'.repeat(64);
    const accountId = 'a'.repeat(64);
    const postId = '1'.repeat(13);
    const parent = `${accountId}/groups/${groupId}/content/post/${postId}`;
    const video = {
      cid: CID_V1,
      mime: 'video/quicktime',
      size: 200 * 1024 * 1024,
      width: 7680,
      height: 4320,
      poster: POSTER_128,
    };
    const post = {
      text: 'z'.repeat(4000),
      timestamp: 1_730_000_000_000,
      places: ['p'.repeat(64)],
      contentWarning: 'w'.repeat(80),
      nsfw: true,
      channel: 'c'.repeat(64),
      access: 'group' as const,
      groupId,
      audiences: ['u'.repeat(128)],
      media: [video, video, video, video],
    };
    const built = buildGroupReplySetData(
      groupId,
      parent,
      post,
      postId,
      post.timestamp
    );
    const storageKey = Object.keys(built)[0]!;
    const stored = Object.values(built)[0] as {
      media: Array<{ cid: string; mime: string; poster?: string }>;
    };
    const withPosters = {
      ...stored,
      media: stored.media.map((item) => ({ ...item, poster: POSTER_128 })),
    };
    expect(socialStorageUsage(storageKey, withPosters)).toBe(6036);
    expect(socialStorageUsage(storageKey, withPosters)).toBeGreaterThan(
      PLATFORM_ALLOWANCE_MAX_BYTES
    );
    expect(stored.media).toHaveLength(4);
    expect(stored.media.every((item) => item.poster === undefined)).toBe(true);
    expect(
      stored.media.every(
        (item) => item.cid === CID_V1 && item.mime === 'video/quicktime'
      )
    ).toBe(true);
    expect(socialStorageUsage(storageKey, stored)).toBe(5476);
    expect(socialStorageUsage(storageKey, stored)).toBeLessThanOrEqual(
      POST_STORAGE_BUDGET_BYTES
    );
    expect(socialStorageUsage(storageKey, stored)).toBeLessThan(
      PLATFORM_ALLOWANCE_MAX_BYTES
    );
  });
});
