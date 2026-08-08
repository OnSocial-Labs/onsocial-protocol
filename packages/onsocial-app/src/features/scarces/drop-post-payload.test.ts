import { describe, expect, it } from 'vitest';
import {
  collectionEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
  resolvedDropPostText,
} from '@/features/scarces/drop-post-payload';

describe('drop-post-payload', () => {
  it('builds a durable collection embed', () => {
    expect(
      collectionEmbedFromDraft({
        collectionId: 'drop-1',
        tokenId: 'drop-1:2',
        title: 'Night',
      })
    ).toMatchObject({
      kind: 'collection',
      chain: 'near',
      collectionId: 'drop-1',
      tokenId: 'drop-1:2',
    });
  });

  it('nests paint snapshot under x.onsocial.drop', () => {
    expect(
      dropSnapshotExtra({
        collectionId: 'drop-1',
        title: 'Night',
        mediumKind: 'audio',
        mediaUrl: 'https://ipfs.io/ipfs/bafy',
      })
    ).toEqual({
      onsocial: {
        drop: {
          collectionId: 'drop-1',
          title: 'Night',
          mediumKind: 'audio',
          mediaUrl: 'https://ipfs.io/ipfs/bafy',
        },
      },
    });
  });

  it('resolves Drop-only captions for chain + optimistic rows', () => {
    expect(
      resolvedDropPostText('', {
        collectionId: 'drop-1',
        title: 'Night',
      })
    ).toBe('Night');
    expect(
      resolvedDropPostText('  listen  ', {
        collectionId: 'drop-1',
        title: 'Night',
      })
    ).toBe('listen');
  });

  it('maps medium to post kind', () => {
    expect(
      dropPostKind({ collectionId: 'drop-1', title: 'x', mediumKind: 'audio' })
    ).toBe('audio');
    expect(
      dropPostKind({ collectionId: 'drop-1', title: 'x', mediumKind: 'art' })
    ).toBe('image');
  });
});
