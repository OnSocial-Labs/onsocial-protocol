import { describe, expect, it } from 'vitest';
import {
  collectionEmbedFromDraft,
  commerceEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
  resolvedDropPostText,
  tokenEmbedFromDraft,
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

  it('builds a durable token embed for resale announces', () => {
    expect(
      tokenEmbedFromDraft({
        tokenId: 's:post-1',
        title: 'Night',
      })
    ).toMatchObject({
      kind: 'token',
      chain: 'near',
      tokenId: 's:post-1',
    });
  });

  it('prefers collection embed when both ids are present', () => {
    expect(
      commerceEmbedFromDraft({
        collectionId: 'drop-1',
        tokenId: 'drop-1:2',
        title: 'Night',
      })
    ).toMatchObject({ kind: 'collection', collectionId: 'drop-1' });
    expect(
      commerceEmbedFromDraft({
        tokenId: 's:post-1',
        title: 'Night',
      })
    ).toMatchObject({ kind: 'token', tokenId: 's:post-1' });
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

  it('allows token-only paint without collectionId', () => {
    expect(
      dropSnapshotExtra({
        tokenId: 's:post-1',
        title: 'Night',
        sourcePostPath: 'alice.near/post/p1',
        mediumKind: 'art',
      })
    ).toEqual({
      onsocial: {
        drop: {
          tokenId: 's:post-1',
          title: 'Night',
          mediumKind: 'art',
          sourcePostPath: 'alice.near/post/p1',
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
    expect(
      resolvedDropPostText('', {
        tokenId: 's:post-1',
        title: 'Resale night',
      })
    ).toBe('Resale night');
  });

  it('maps medium to post kind', () => {
    expect(
      dropPostKind({ collectionId: 'drop-1', title: 'x', mediumKind: 'audio' })
    ).toBe('audio');
    expect(
      dropPostKind({ collectionId: 'drop-1', title: 'x', mediumKind: 'art' })
    ).toBe('image');
    expect(
      dropPostKind({ tokenId: 's:1', title: 'x', mediumKind: 'video' })
    ).toBe('video');
  });
});
