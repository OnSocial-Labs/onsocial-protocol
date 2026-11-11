import { describe, expect, it } from 'vitest';
import { pressProfileEssayAlign } from './profile-essay-align';

describe('pressProfileEssayAlign', () => {
  it('selects a different alignment', () => {
    expect(pressProfileEssayAlign('left', 'center')).toBe('center');
    expect(pressProfileEssayAlign('center', 'justify')).toBe('justify');
    expect(pressProfileEssayAlign('justify', 'left')).toBe('left');
  });

  it('returns center and justify to left when pressed again', () => {
    expect(pressProfileEssayAlign('center', 'center')).toBe('left');
    expect(pressProfileEssayAlign('justify', 'justify')).toBe('left');
  });

  it('keeps left when left is pressed again', () => {
    expect(pressProfileEssayAlign('left', 'left')).toBe('left');
  });
});
