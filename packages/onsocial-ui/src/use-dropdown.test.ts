import { describe, expect, it } from 'vitest';
import { useDropdown } from './use-dropdown.js';

describe('useDropdown', () => {
  it('exports a hook', () => {
    expect(typeof useDropdown).toBe('function');
  });
});
