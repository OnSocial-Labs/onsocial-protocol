import { describe, expect, it } from 'vitest';
import { reorderByInsert } from './drop-track-order';

describe('reorderByInsert', () => {
  const tracks = ['A', 'B', 'C', 'D', 'E'];

  it('moves a track to the front', () => {
    expect(reorderByInsert(tracks, 4, 0)).toEqual(['E', 'A', 'B', 'C', 'D']);
  });

  it('moves a track to the end', () => {
    expect(reorderByInsert(tracks, 0, 5)).toEqual(['B', 'C', 'D', 'E', 'A']);
  });

  it('swaps neighbors by inserting after the next row', () => {
    expect(reorderByInsert(tracks, 0, 2)).toEqual(['B', 'A', 'C', 'D', 'E']);
  });

  it('is a no-op for the gaps beside the dragged row', () => {
    expect(reorderByInsert(tracks, 2, 2)).toBe(tracks);
    expect(reorderByInsert(tracks, 2, 3)).toBe(tracks);
  });

  it('preserves relative order of the other tracks', () => {
    expect(reorderByInsert(tracks, 1, 4)).toEqual(['A', 'C', 'D', 'B', 'E']);
  });
});
