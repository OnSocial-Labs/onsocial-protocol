import { describe, expect, it } from 'vitest';
import {
  isEndorsementSpendTargetId,
  resolveEndorsementSpendTargetId,
} from '@/lib/social-spend-endorsement';
import {
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
  resolveEndorsementOptimisticDraftMedia,
} from '@/lib/endorsement-media';

describe('resolveEndorsementSpendTargetId', () => {
  it('prefers a UUID endorsement id', () => {
    expect(
      resolveEndorsementSpendTargetId({
        id: '550e8400-e29b-41d4-a716-446655440000',
        issuer: 'alice.near',
        target: 'bob.near',
        topic: 'design',
      })
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('builds a legacy spend id when UUID is missing', () => {
    expect(
      resolveEndorsementSpendTargetId({
        issuer: 'Alice.near',
        target: 'Bob.near',
        topic: 'Product Design',
      })
    ).toBe('legacy:alice.near:bob.near:product-design');
  });

  it('uses general when topic is blank', () => {
    expect(
      resolveEndorsementSpendTargetId({
        issuer: 'alice.near',
        target: 'bob.near',
        topic: '  ',
      })
    ).toBe('legacy:alice.near:bob.near:general');
  });
});

describe('isEndorsementSpendTargetId', () => {
  it('accepts uuid and legacy forms', () => {
    expect(
      isEndorsementSpendTargetId('550e8400-e29b-41d4-a716-446655440000')
    ).toBe(true);
    expect(
      isEndorsementSpendTargetId('legacy:alice.near:bob.near:design')
    ).toBe(true);
    expect(isEndorsementSpendTargetId('not-an-id')).toBe(false);
  });
});

describe('endorsement media helpers', () => {
  it('parses MediaRef and resolves display url', () => {
    const media = parseEndorsementMediaRef({
      cid: 'bafytest',
      mime: 'image/jpeg',
      size: 12,
    });
    expect(media).toEqual({
      cid: 'bafytest',
      mime: 'image/jpeg',
      size: 12,
    });
    expect(
      resolveEndorsementDisplayMediaUrl({ media }, 'testnet')
    ).toBe('https://cdn.testnet.onsocial.id/ipfs/bafytest');
    expect(
      resolveEndorsementDisplayMediaUrl(
        { media, mediaUrl: 'https://cdn.example/direct.jpg' },
        'testnet'
      )
    ).toBe('https://cdn.example/direct.jpg');
  });

  it('rejects incomplete media refs', () => {
    expect(parseEndorsementMediaRef({ cid: 'x' })).toBeNull();
    expect(parseEndorsementMediaRef(null)).toBeNull();
  });

  it('keeps a new file preview on the optimistic draft', () => {
    const file = new File(['x'], 'shot.jpg', { type: 'image/jpeg' });
    const draft = resolveEndorsementOptimisticDraftMedia({
      mediaRemoved: false,
      mediaFile: file,
      existingMedia: { cid: 'old', mime: 'image/jpeg' },
      existingMediaUrl: 'https://cdn.example/old.jpg',
    });
    expect(draft.media).toBeNull();
    expect(draft.mediaUrl).toMatch(/^blob:/);
    URL.revokeObjectURL(draft.mediaUrl!);
  });

  it('keeps existing media when no new file is attached', () => {
    const existing = { cid: 'old', mime: 'image/jpeg' as const };
    expect(
      resolveEndorsementOptimisticDraftMedia({
        mediaRemoved: false,
        mediaFile: null,
        existingMedia: existing,
        existingMediaUrl: 'https://cdn.example/old.jpg',
      })
    ).toEqual({
      media: existing,
      mediaUrl: 'https://cdn.example/old.jpg',
    });
  });

  it('clears media when the viewer removed it', () => {
    expect(
      resolveEndorsementOptimisticDraftMedia({
        mediaRemoved: true,
        mediaFile: new File(['x'], 'shot.jpg', { type: 'image/jpeg' }),
        existingMedia: { cid: 'old', mime: 'image/jpeg' },
        existingMediaUrl: 'https://cdn.example/old.jpg',
      })
    ).toEqual({ media: null, mediaUrl: null });
  });
});
