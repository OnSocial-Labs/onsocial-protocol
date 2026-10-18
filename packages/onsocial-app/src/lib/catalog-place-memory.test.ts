import { describe, expect, it, beforeEach } from 'vitest';
import {
  CATALOG_PLACE_MEMORY_TTL_MS,
  clearCatalogPlaceMemory,
  mergeCatalogHead,
  peekPlaceScroll,
  writePlaceScroll,
} from './catalog-place-memory';

describe('catalog place memory', () => {
  beforeEach(() => {
    clearCatalogPlaceMemory();
  });

  it('remembers a scroll line until the tab memory expires', () => {
    writePlaceScroll('market|all', 640, 1_000);
    expect(peekPlaceScroll('market|all', 1_000)).toBe(640);
    expect(
      peekPlaceScroll('market|all', 1_000 + CATALOG_PLACE_MEMORY_TTL_MS + 1)
    ).toBe(0);
  });

  it('keeps paged rows behind a refreshed first page', () => {
    const merged = mergeCatalogHead(
      [
        { id: 'a', name: 'old' },
        { id: 'b', name: 'old' },
        { id: 'c', name: 'tail' },
      ],
      [
        { id: 'a', name: 'new' },
        { id: 'b', name: 'new' },
      ],
      (item) => item.id
    );
    expect(merged).toEqual([
      { id: 'a', name: 'new' },
      { id: 'b', name: 'new' },
      { id: 'c', name: 'tail' },
    ]);
  });

  it('uses the new page when nothing was paged further', () => {
    expect(
      mergeCatalogHead(
        [{ id: 'a' }],
        [{ id: 'b' }, { id: 'c' }],
        (item) => item.id
      )
    ).toEqual([{ id: 'b' }, { id: 'c' }]);
  });
});
