import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGroupPostSetData,
  buildGroupReplySetData,
} from '../builders/group-post.js';
import { buildPostSetData, resolvePostMedia } from '../builders/post.js';
import { captureBlobVideoPoster } from './media-poster.js';
import {
  omitPostersOverStorageBudget,
  POST_STORAGE_BUDGET_BYTES,
  socialStorageUsage,
} from './post-storage-budget.js';
import * as posterCid from './poster-cid.js';
import { validatePostV1, validateProfileV1 } from '../schema/v1.js';
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

  it('validatePostV1 and validateProfileV1 still accept an https poster', () => {
    const https = 'https://evil.example/x.jpg';
    expect(
      validatePostV1({
        v: 1,
        text: 'clip',
        timestamp: 1,
        media: [{ cid: CID_V1, mime: 'video/mp4', poster: https }],
      })
    ).toBeNull();
    expect(
      validateProfileV1({
        v: 1,
        avatar: { cid: CID_V1, mime: 'image/jpeg', poster: https },
        banner: { cid: CID_V0, mime: 'image/jpeg', poster: https },
      })
    ).toBeNull();
  });

  it('strips an https poster from media-only input and keeps the video', () => {
    const built = buildPostSetData(
      {
        text: 'clip',
        media: [
          {
            cid: CID_V1,
            mime: 'video/mp4',
            poster: 'https://evil.example/x.jpg',
          },
        ],
      },
      'post-1',
      1
    );
    const stored = Object.values(built)[0] as {
      media: Array<{ cid: string; mime: string; poster?: string }>;
    };
    expect(stored.media).toEqual([{ cid: CID_V1, mime: 'video/mp4' }]);
  });

  it('skips a non-CID or over-128 poster upload and still writes the video', async () => {
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
    const setPath = Object.keys(built)[0]!;
    expect(setPath).toBe(`groups/${groupId}/content/post/${postId}`);
    const storageKey = `${accountId}/groups/${groupId}/content/post/${postId}`;
    const stored = Object.values(built)[0] as {
      media: Array<{ cid: string; mime: string; poster?: string }>;
    };
    const withPosters = {
      ...stored,
      media: stored.media.map((item) => ({ ...item, poster: POSTER_128 })),
    };
    expect(socialStorageUsage(storageKey, withPosters)).toBe(6101);
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
    expect(socialStorageUsage(storageKey, stored)).toBe(5541);
    expect(socialStorageUsage(storageKey, stored)).toBeLessThanOrEqual(
      POST_STORAGE_BUDGET_BYTES
    );
    expect(socialStorageUsage(storageKey, stored)).toBeLessThan(
      PLATFORM_ALLOWANCE_MAX_BYTES
    );
  });

  it('keeps posters at exactly 5700 bytes and drops them at 5701', () => {
    const atBudget = valueAtStorageUsage(5700);
    expect(socialStorageUsage(atBudget.key, atBudget.value)).toBe(5700);
    const kept = omitPostersOverStorageBudget(atBudget.value, atBudget.key) as {
      media: Array<{ poster?: string; cid: string }>;
    };
    expect(kept.media[0]?.poster).toBe(CID_V1);
    expect(kept.media[0]?.cid).toBe(CID_V1);

    const overBudget = valueAtStorageUsage(5701);
    expect(socialStorageUsage(overBudget.key, overBudget.value)).toBe(5701);
    const dropped = omitPostersOverStorageBudget(
      overBudget.value,
      overBudget.key
    ) as { media: Array<{ poster?: string; cid: string; mime: string }> };
    expect(dropped.media[0]?.poster).toBeUndefined();
    expect(dropped.media[0]).toEqual({ cid: CID_V1, mime: 'video/mp4' });
  });

  it('counts multi-byte text as utf-8 bytes', () => {
    const key = 'k';
    const value = { text: '你'.repeat(10) };
    const json = JSON.stringify(value);
    const utf8 = new TextEncoder().encode(json).length;
    expect(utf8).toBe(json.length + 20);
    expect(socialStorageUsage(key, value)).toBe(
      new TextEncoder().encode(key).length + utf8 + 13 + 40
    );
    expect(socialStorageUsage(key, value)).not.toBe(
      key.length + json.length + 13 + 40
    );
  });

  it('rejects a 129-character cid for length, not as a generic non-cid', () => {
    const long = `b${'a'.repeat(128)}`;
    expect(long.length).toBe(129);
    expect(posterReason(long)).toBe('length');
    expect(posterReason(long)).not.toBe('not-a-cid');
    expect(posterReason('not a cid')).toBe('not-a-cid');
  });

  it('rejects ipfs path, whitespace, and unicode posters', () => {
    expect(posterReason(`ipfs://${CID_V1}/path`)).toBe('not-a-cid');
    expect(posterReason(` ${CID_V1}`)).toBe('not-a-cid');
    expect(posterReason(`${CID_V1} `)).toBe('not-a-cid');
    expect(posterReason(`${CID_V1}\n`)).toBe('not-a-cid');
    expect(posterReason(`${CID_V1}你`)).toBe('not-a-cid');
    expect(posterReason('ｂａｆｙ')).toBe('not-a-cid');
  });

  it('budgets a group post on the author-prefixed storage key', () => {
    const groupId = 'g';
    const postId = '1';
    const author = 'a'.repeat(64);
    const shortKey = `groups/${groupId}/content/post/${postId}`;
    const chargedKey = `${author}/${shortKey}`;
    const text = textForShortKeyUsage(shortKey, 5660);
    const input = {
      text,
      media: [{ cid: CID_V1, mime: 'video/mp4' as const, poster: POSTER_128 }],
    };
    const probed = buildGroupPostSetData(groupId, input, postId, 1);
    const probedValue = Object.values(probed)[0] as {
      media: Array<{ poster?: string; cid: string; mime: string }>;
    };
    const withPosters = {
      ...probedValue,
      media: probedValue.media.map((item) => ({ ...item, poster: POSTER_128 })),
    };
    expect(socialStorageUsage(shortKey, withPosters)).toBe(5660);
    expect(socialStorageUsage(chargedKey, withPosters)).toBe(5725);
    expect(Object.keys(probed)[0]).toBe(shortKey);
    expect(probedValue.media[0]?.poster).toBeUndefined();
    expect(probedValue.media[0]?.cid).toBe(CID_V1);
    expect(probedValue.media[0]?.mime).toBe('video/mp4');
  });
});

function posterReason(raw: string): string | null {
  const rejection = (
    posterCid as {
      posterCidRejection?: (value: string) => string | null;
    }
  ).posterCidRejection;
  if (rejection) return rejection(raw);
  return posterCid.acceptedPosterCid(raw) === null ? 'not-a-cid' : null;
}

function valueAtStorageUsage(target: number): {
  key: string;
  value: {
    text: string;
    media: Array<{ cid: string; mime: string; poster: string }>;
  };
} {
  const key = 'budget-key';
  const media = [{ cid: CID_V1, mime: 'video/mp4', poster: CID_V1 }];
  const base = socialStorageUsage(key, { text: '', media });
  const value = { text: 'x'.repeat(target - base), media };
  return { key, value };
}

function textForShortKeyUsage(shortKey: string, target: number): string {
  const groupId = 'g';
  const postId = '1';
  for (let length = 0; length < 8000; length += 1) {
    const built = buildGroupPostSetData(
      groupId,
      {
        text: 'x'.repeat(length),
        media: [{ cid: CID_V1, mime: 'video/mp4', poster: POSTER_128 }],
      },
      postId,
      1
    );
    const value = Object.values(built)[0] as {
      media: Array<{ poster?: string }>;
    };
    const withPosters = {
      ...value,
      media: value.media.map((item) => ({ ...item, poster: POSTER_128 })),
    };
    if (socialStorageUsage(shortKey, withPosters) === target) {
      return 'x'.repeat(length);
    }
  }
  throw new Error(`no text length hits storage usage ${target}`);
}
