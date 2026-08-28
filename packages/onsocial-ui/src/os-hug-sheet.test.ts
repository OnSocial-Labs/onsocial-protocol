import { describe, expect, it } from 'vitest';
import { resolveHugSheetHeader } from './os-hug-sheet.js';

describe('resolveHugSheetHeader', () => {
  it('keeps a large label title for plain drawers', () => {
    expect(
      resolveHugSheetHeader({
        chrome: 'plain',
        label: 'Add member',
        copy: 'Search profiles to invite.',
      })
    ).toEqual({
      title: 'Add member',
      subtitle: 'Search profiles to invite.',
    });
  });

  it('uses kind as eyebrow and name as title for facts', () => {
    expect(
      resolveHugSheetHeader({
        chrome: 'facts',
        label: 'Hub',
        copy: 'Midnight Records',
      })
    ).toEqual({
      eyebrow: 'Hub',
      title: 'Midnight Records',
    });
  });

  it('leaves a facts label as the title when there is no name', () => {
    expect(
      resolveHugSheetHeader({
        chrome: 'facts',
        label: 'About',
      })
    ).toEqual({
      title: 'About',
    });
  });
});
