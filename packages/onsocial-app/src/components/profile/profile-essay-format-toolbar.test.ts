import { describe, expect, it } from 'vitest';
import { cycleProfileEssayAlign } from './profile-essay-align';

describe('cycleProfileEssayAlign', () => {
  it('walks left, center, justify, then back to left', () => {
    expect(cycleProfileEssayAlign('left')).toBe('center');
    expect(cycleProfileEssayAlign('center')).toBe('justify');
    expect(cycleProfileEssayAlign('justify')).toBe('left');
  });
});
