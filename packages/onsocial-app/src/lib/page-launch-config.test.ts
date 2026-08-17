import { describe, expect, it } from 'vitest';
import {
  preferPinnedOrder,
  sanitizeLinkNotes,
  sanitizeSectionPins,
  toggleSectionPin,
} from './page-launch-config';

describe('preferPinnedOrder', () => {
  it('leads with known pins then keeps remaining order', () => {
    const items = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
    ];
    expect(
      preferPinnedOrder(items, ['c', 'missing', 'a'], (item) => item.id)
    ).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'd' }]);
  });
});

describe('sanitizeSectionPins', () => {
  it('caps pins and drops unknown sections', () => {
    expect(
      sanitizeSectionPins({
        posts: ['1', '2', '3', '4'],
        profile: ['x'],
        groups: ['g1', ''],
      })
    ).toEqual({
      posts: ['1', '2', '3'],
      groups: ['g1'],
    });
  });
});

describe('sanitizeLinkNotes', () => {
  it('trims and drops empty notes', () => {
    expect(
      sanitizeLinkNotes({
        website: '  Weekly essays  ',
        x: '   ',
      })
    ).toEqual({ website: 'Weekly essays' });
  });
});

describe('toggleSectionPin', () => {
  it('adds, removes, and rotates at max', () => {
    expect(toggleSectionPin(['a'], 'b', 3)).toEqual(['a', 'b']);
    expect(toggleSectionPin(['a', 'b'], 'a', 3)).toEqual(['b']);
    expect(toggleSectionPin(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
  });
});
