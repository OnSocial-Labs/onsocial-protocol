import { describe, expect, it } from 'vitest';
import {
  filterPinnedSongChoices,
  heldCollectionId,
  loadHeldCollectionIds,
  loadPinnedSongChoices,
  mergePinnedSongChoices,
  pinnedSongChoicesFromViews,
  type PinnedSongCatalogView,
  type PinnedSongChoice,
} from './pinned-song-choices';

function view(
  id: string,
  kind: string,
  playables: number
): PinnedSongCatalogView {
  return {
    collectionId: id,
    title: id,
    kind,
    playables: Array.from({ length: playables }, () => ({})),
  };
}

describe('loadPinnedSongChoices', () => {
  it('keeps paging past a full page of non-audio drops', async () => {
    const pages: PinnedSongCatalogView[][] = [
      [view('poster', 'art', 0), view('ticket', 'ticket', 0)],
      [view('midnight', 'audio', 3), view('legacy', 'music', 1)],
    ];
    const choices = await loadPinnedSongChoices(
      async (offset, limit) => {
        const slice = pages[offset / limit] ?? [];
        return { views: slice, fetched: slice.length };
      },
      { pageSize: 2 }
    );
    expect(choices.map((choice) => choice.id)).toEqual(['midnight', 'legacy']);
  });

  it('stops when a page is short', async () => {
    let calls = 0;
    await loadPinnedSongChoices(
      async () => {
        calls += 1;
        return { views: [view('single', 'audio', 1)], fetched: 1 };
      },
      { pageSize: 2 }
    );
    expect(calls).toBe(1);
  });
});

function choice(
  id: string,
  source: PinnedSongChoice['source'],
  creatorId: string | null = null
): PinnedSongChoice {
  return { id, title: id, source, creatorId };
}

describe('mergePinnedSongChoices', () => {
  it('keeps a published album once when the owner also holds a copy', () => {
    const merged = mergePinnedSongChoices(
      [choice('midnight', 'released', 'artist.testnet')],
      [
        choice('midnight', 'collected', 'artist.testnet'),
        choice('guest', 'collected', 'other.testnet'),
      ]
    );
    expect(merged.map((entry) => [entry.id, entry.source])).toEqual([
      ['midnight', 'released'],
      ['guest', 'collected'],
    ]);
  });
});

describe('filterPinnedSongChoices', () => {
  it('matches title or artist and keeps the current pin', () => {
    const choices = [
      choice('midnight', 'released', 'artist.testnet'),
      choice('shore', 'collected', 'guest.testnet'),
    ];
    expect(
      filterPinnedSongChoices(choices, 'guest', null).map((entry) => entry.id)
    ).toEqual(['shore']);
    expect(
      filterPinnedSongChoices(choices, 'nope', 'midnight').map(
        (entry) => entry.id
      )
    ).toEqual(['midnight']);
  });
});

describe('heldCollectionId', () => {
  it('uses the collection id, then the token prefix', () => {
    expect(
      heldCollectionId({ collectionId: 'album', tokenId: 'other:1' })
    ).toBe('album');
    expect(heldCollectionId({ collectionId: null, tokenId: 'album:4' })).toBe(
      'album'
    );
    expect(heldCollectionId({ collectionId: null, tokenId: 's:post' })).toBe(
      null
    );
  });
});

describe('loadHeldCollectionIds', () => {
  it('collapses copies and keeps ids already read when a later page fails', async () => {
    const ids = await loadHeldCollectionIds(
      async (offset) => {
        if (offset > 0) throw new Error('later page');
        return { ids: ['album', 'album', null, 'single'], fetched: 2 };
      },
      { pageSize: 2 }
    );
    expect(ids).toEqual(['album', 'single']);
  });
});

describe('pinnedSongChoicesFromViews', () => {
  it('keeps track titles only when the release has more than one', () => {
    const single = pinnedSongChoicesFromViews([
      {
        ...view('single', 'audio', 1),
        playables: [{ title: 'Only' }],
      },
    ]);
    const album = pinnedSongChoicesFromViews([
      {
        ...view('album', 'audio', 2),
        playables: [{ title: 'Opener' }, { title: '  ' }, {}],
      },
    ]);
    expect(single[0]?.tracks).toBeUndefined();
    expect(album[0]?.tracks).toEqual([
      { title: 'Opener' },
      { title: 'Track 2' },
      { title: 'Track 3' },
    ]);
  });
});
