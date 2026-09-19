import { describe, expect, it } from 'vitest';
import { feedScrollToNewestBehavior } from './feed-scroll-to-newest';

describe('feedScrollToNewestBehavior', () => {
  it('jumps when already at the top or motion is reduced', () => {
    expect(feedScrollToNewestBehavior(0, 800)).toBe('auto');
    expect(feedScrollToNewestBehavior(8, 800)).toBe('auto');
    expect(feedScrollToNewestBehavior(120, 800, true)).toBe('auto');
  });

  it('eases when the head is within one screen', () => {
    expect(feedScrollToNewestBehavior(200, 800)).toBe('smooth');
    expect(feedScrollToNewestBehavior(800, 800)).toBe('smooth');
  });

  it('jumps when the head is more than one screen away', () => {
    expect(feedScrollToNewestBehavior(801, 800)).toBe('auto');
    expect(feedScrollToNewestBehavior(2400, 800)).toBe('auto');
  });
});
