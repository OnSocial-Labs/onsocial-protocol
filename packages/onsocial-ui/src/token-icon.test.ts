import { describe, expect, it } from 'vitest';
import { TokenIcon, osTokenIconClassName } from './token-icon.js';

describe('TokenIcon', () => {
  it('exports the token mark and class token', () => {
    expect(typeof TokenIcon).toBe('function');
    expect(osTokenIconClassName).toBe('os-token-icon');
  });
});
