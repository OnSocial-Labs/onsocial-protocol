import { describe, expect, it } from 'vitest';
import {
  formatProfileMediaRef,
  resolveProfileMediaField,
} from './profile-media.js';
import type { StorageProvider } from '../storage/provider.js';

const storage: StorageProvider = {
  upload: async () => ({ cid: 'bafy', mime: 'image/png', size: 1 }),
  uploadJson: async () => ({ cid: 'bafy', mime: 'application/json', size: 1 }),
  url: (cid) => `https://cdn.test/ipfs/${cid}`,
};

describe('resolveProfileMediaField', () => {
  it('resolves ipfs image refs', () => {
    expect(resolveProfileMediaField('ipfs://bafyAvatar', storage)).toEqual({
      kind: 'image',
      url: 'https://cdn.test/ipfs/bafyAvatar',
    });
  });

  it('resolves MediaRef JSON for video', () => {
    expect(
      resolveProfileMediaField(
        JSON.stringify({ cid: 'bafyVideo', mime: 'video/mp4' }),
        storage
      )
    ).toEqual({
      kind: 'video',
      url: 'https://cdn.test/ipfs/bafyVideo',
    });
  });

  it('detects video from file extension on plain URLs', () => {
    expect(
      resolveProfileMediaField('https://cdn.example/clip.mp4', storage)
    ).toEqual({
      kind: 'video',
      url: 'https://cdn.example/clip.mp4',
    });
  });
});

describe('formatProfileMediaRef', () => {
  it('stores video uploads as MediaRef JSON', () => {
    expect(
      formatProfileMediaRef({ cid: 'bafyVid', mime: 'video/mp4', size: 42 })
    ).toBe(JSON.stringify({ cid: 'bafyVid', mime: 'video/mp4', size: 42 }));
  });

  it('stores image uploads as ipfs urls', () => {
    expect(formatProfileMediaRef({ cid: 'bafyImg', mime: 'image/webp' })).toBe(
      'ipfs://bafyImg'
    );
  });
});
