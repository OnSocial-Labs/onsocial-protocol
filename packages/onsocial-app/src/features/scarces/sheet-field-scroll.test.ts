import { describe, expect, it } from 'vitest';
import { sheetBodyScrollTopForField } from '@/features/scarces/sheet-field-scroll';

describe('sheetBodyScrollTopForField', () => {
  it('parks a field that sits below the body top at the top of the band', () => {
    expect(sheetBodyScrollTopForField(100, 0, 340, 6)).toBe(234);
  });

  it('keeps a field already at the top from scrolling negative', () => {
    expect(sheetBodyScrollTopForField(80, 40, 86, 6)).toBe(40);
  });

  it('adds the current scroll offset when the cover has already moved', () => {
    expect(sheetBodyScrollTopForField(50, 120, 210, 6)).toBe(274);
  });
});
