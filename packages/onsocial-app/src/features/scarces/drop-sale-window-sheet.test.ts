import { describe, expect, it } from 'vitest';
import { saleWindowClearSelected } from '@/features/scarces/drop-sale-window-sheet';

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
