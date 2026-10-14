import { describe, expect, it } from 'vitest';
import {
  dropsListCoverAction,
  dropsListCoverLabel,
  dropsShopActionLabel,
  dropsShopMintable,
} from '@/features/drops/drops-page-view';

describe('drops shop action', () => {
  it('is Collect on live and allowlist early mint, Open otherwise', () => {
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'live',
          hasAllowlist: false,
        })
      )
    ).toBe('Collect');
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'upcoming',
          hasAllowlist: true,
          allowlistRemaining: 2,
        })
      )
    ).toBe('Collect');
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'upcoming',
          hasAllowlist: true,
          allowlistRemaining: 0,
        })
      )
    ).toBe('Open');
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'ended',
          hasAllowlist: false,
        })
      )
    ).toBe('Open');
    expect(
      dropsShopActionLabel(
        dropsShopMintable({
          status: 'sold_out',
          hasAllowlist: false,
        })
      )
    ).toBe('Open');
  });
});

describe('drops list cover', () => {
  it('reads writing, a book, and an article on the list', () => {
    expect(
      dropsListCoverAction({
        mediumKind: 'writing',
        hasPlayable: false,
        mediaUrl: null,
        view: null,
      })
    ).toBe('read');
    expect(
      dropsListCoverAction({
        mediumKind: 'book',
        hasPlayable: false,
        mediaUrl: 'https://example.com/book.png',
        view: null,
      })
    ).toBe('read');
    expect(
      dropsListCoverAction({
        mediumKind: 'art',
        hasPlayable: false,
        mediaUrl: 'https://example.com/art.png',
        view: { readables: [{ cid: 'chapter' }] },
      })
    ).toBe('read');
    expect(dropsListCoverLabel('read', 'Chapter One')).toBe('Read Chapter One');
  });

  it('listens when audio has tracks', () => {
    expect(
      dropsListCoverAction({
        mediumKind: 'audio',
        hasPlayable: true,
        mediaUrl: 'https://example.com/cover.png',
        view: null,
      })
    ).toBe('listen');
    expect(
      dropsListCoverAction({
        mediumKind: 'music',
        hasPlayable: true,
        mediaUrl: null,
        view: null,
      })
    ).toBe('listen');
    expect(
      dropsListCoverAction({
        mediumKind: 'audio',
        hasPlayable: false,
        mediaUrl: 'https://example.com/cover.png',
        view: null,
      })
    ).toBeNull();
    expect(dropsListCoverLabel('listen', 'Night Drive')).toBe(
      'Listen to Night Drive'
    );
  });

  it('opens art large and leaves a bare cover as a drop link', () => {
    expect(
      dropsListCoverAction({
        mediumKind: 'art',
        hasPlayable: false,
        mediaUrl: 'https://example.com/print.png',
        view: null,
      })
    ).toBe('artwork');
    expect(
      dropsListCoverAction({
        mediumKind: 'video',
        hasPlayable: true,
        mediaUrl: 'https://example.com/clip.png',
        view: null,
      })
    ).toBe('artwork');
    expect(
      dropsListCoverAction({
        mediumKind: 'art',
        hasPlayable: false,
        mediaUrl: null,
        view: null,
      })
    ).toBeNull();
    expect(dropsListCoverLabel('artwork', 'Quiet Print')).toBe(
      'View Quiet Print'
    );
  });
});
