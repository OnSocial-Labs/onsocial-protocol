import { describe, expect, it } from 'vitest';
import { SearchField, searchFieldClassName } from './search-field.js';

describe('SearchField', () => {
  it('exports a component', () => {
    expect(typeof SearchField).toBe('function');
  });

  it('exports the base class name', () => {
    expect(searchFieldClassName).toBe('search-field');
  });
});
