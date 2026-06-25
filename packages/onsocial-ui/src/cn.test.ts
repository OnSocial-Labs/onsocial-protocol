import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('merges tailwind classes with later wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles conditional classes', () => {
    const hidden = false;
    expect(cn('base', hidden && 'hidden', 'extra')).toBe('base extra');
  });
});
