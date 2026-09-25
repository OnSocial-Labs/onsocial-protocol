import { describe, expect, it } from 'vitest';
import {
  loadPinnedSongChoices,
  type PinnedSongCatalogView,
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
    expect(choices.map((choice) => choice.id)).toEqual([
      'midnight',
      'legacy',
    ]);
  });

  it('stops when a page is short', async () => {
    let calls = 0;
    await loadPinnedSongChoices(async () => {
      calls += 1;
      return { views: [view('single', 'audio', 1)], fetched: 1 };
    }, { pageSize: 2 });
    expect(calls).toBe(1);
  });
});
