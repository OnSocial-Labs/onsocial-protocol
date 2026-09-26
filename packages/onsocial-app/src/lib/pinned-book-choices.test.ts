import { describe, expect, it } from 'vitest';
import {
  filterPinnedBookChoices,
  loadPinnedBookChoices,
  mergePinnedBookChoices,
  pinnedBookCatalogFormat,
  pinnedBookMarkFormat,
  type PinnedBookChoice,
} from './pinned-book-choices';
import type { PinnedSongCatalogView } from './pinned-song-choices';

function view(
  id: string,
  patch: Partial<PinnedSongCatalogView> = {}
): PinnedSongCatalogView {
  return {
    collectionId: id,
    title: id,
    kind: 'writing',
    playables: [],
    ...patch,
  };
}

describe('pinnedBookCatalogFormat', () => {
  it('keeps books and issues and skips articles and audio', () => {
    expect(
      pinnedBookCatalogFormat(
        view('novel', {
          writingFormat: 'book',
          writingManifestCid: 'bafybook',
        })
      )
    ).toBe('book');
    expect(
      pinnedBookCatalogFormat(
        view('folio', {
          writingFormat: 'issue',
          writingManifestCid: 'bafyissue',
        })
      )
    ).toBe('issue');
    expect(
      pinnedBookCatalogFormat(view('essay', { readables: [{ text: 'post' }] }))
    ).toBeNull();
    expect(pinnedBookCatalogFormat(view('essay'))).toBeNull();
    expect(
      pinnedBookCatalogFormat(
        view('single', { kind: 'audio', playables: [{}] })
      )
    ).toBeNull();
  });
});

describe('pinnedBookMarkFormat', () => {
  it('opens a loaded folio and stays off a listed article', () => {
    expect(
      pinnedBookMarkFormat(
        view('novel', {
          writingFormat: 'book',
          readables: [{}, {}],
        })
      )
    ).toBe('book');
    expect(
      pinnedBookMarkFormat(
        view('folio', {
          writingFormat: 'issue',
          readables: [{}],
        })
      )
    ).toBe('issue');
    expect(
      pinnedBookMarkFormat(view('essay', { readables: [{ text: 'post' }] }))
    ).toBeNull();
    expect(
      pinnedBookMarkFormat(
        view('pending', {
          writingFormat: 'book',
          writingManifestCid: 'bafybook',
        })
      )
    ).toBeNull();
  });
});

describe('loadPinnedBookChoices', () => {
  it('keeps paging past drops that are not books', async () => {
    const pages: PinnedSongCatalogView[][] = [
      [view('poster', { kind: 'art' }), view('essay')],
      [
        view('novel', {
          writingFormat: 'book',
          writingManifestCid: 'bafybook',
        }),
        view('folio', { writingFormat: 'issue', readables: [{}] }),
      ],
    ];
    const choices = await loadPinnedBookChoices(
      async (offset, limit) => {
        const slice = pages[offset / limit] ?? [];
        return { views: slice, fetched: slice.length };
      },
      { pageSize: 2 }
    );
    expect(choices.map((choice) => [choice.id, choice.format])).toEqual([
      ['novel', 'book'],
      ['folio', 'issue'],
    ]);
  });
});

function choice(
  id: string,
  format: PinnedBookChoice['format'],
  source: PinnedBookChoice['source'],
  creatorId: string | null = null
): PinnedBookChoice {
  return { id, title: id, source, creatorId, format };
}

describe('mergePinnedBookChoices', () => {
  it('keeps a published book once when the owner also holds a copy', () => {
    const merged = mergePinnedBookChoices(
      [choice('novel', 'book', 'released', 'author.testnet')],
      [
        choice('novel', 'book', 'collected', 'author.testnet'),
        choice('folio', 'issue', 'collected', 'other.testnet'),
      ]
    );
    expect(
      merged.map((entry) => [entry.id, entry.source, entry.format])
    ).toEqual([
      ['novel', 'released', 'book'],
      ['folio', 'collected', 'issue'],
    ]);
  });
});

describe('filterPinnedBookChoices', () => {
  it('matches title, artist, or format and keeps the current pin', () => {
    const choices = [
      choice('Field notes', 'book', 'released', 'author.testnet'),
      choice('Monday', 'issue', 'collected', 'guest.testnet'),
    ];
    expect(
      filterPinnedBookChoices(choices, 'issue', null).map((entry) => entry.id)
    ).toEqual(['Monday']);
    expect(
      filterPinnedBookChoices(choices, 'guest', 'Field notes').map(
        (entry) => entry.id
      )
    ).toEqual(['Field notes', 'Monday']);
  });
});
