import { describe, expect, it } from 'vitest';
import {
  saleWindowClearLabel,
  saleWindowClearSelected,
  saleWindowExceedsMax,
} from '@/features/scarces/drop-sale-window-sheet';

describe('saleWindowClearSelected', () => {
  it('highlights Clear only while an empty window is still the choice', () => {
    expect(saleWindowClearSelected('', false)).toBe(true);
    expect(saleWindowClearSelected('   ', false)).toBe(true);
    expect(saleWindowClearSelected('', true)).toBe(false);
    expect(saleWindowClearSelected('2026-09-24T18:00', false)).toBe(false);
    expect(saleWindowClearSelected('2026-09-24T18:00', true)).toBe(false);
    expect(saleWindowClearSelected('', false, false)).toBe(false);
  });
});

describe('saleWindowClearLabel', () => {
  it('clears a required event end and keeps No end for an open-ended sale', () => {
    expect(saleWindowClearLabel('eventEnds')).toBe('Clear');
    expect(saleWindowClearLabel('eventStarts')).toBe('Clear');
    expect(saleWindowClearLabel('opens')).toBe('Clear');
    expect(saleWindowClearLabel('closes')).toBe('No end');
    expect(saleWindowClearLabel('access')).toBe('No end');
  });
});

describe('saleWindowExceedsMax', () => {
  it('allows a close equal to the event end and blocks a later minute', () => {
    const end = '2026-09-25T21:54';
    expect(saleWindowExceedsMax(end, end, true)).toBe(false);
    expect(saleWindowExceedsMax('2026-09-25T21:55', end, true)).toBe(true);
    expect(saleWindowExceedsMax('2026-09-25T21:53', end, true)).toBe(false);
    expect(saleWindowExceedsMax(end, end, false)).toBe(true);
    expect(saleWindowExceedsMax('2026-09-25T21:53', end, false)).toBe(false);
    expect(saleWindowExceedsMax(end, undefined, true)).toBe(false);
  });
});
