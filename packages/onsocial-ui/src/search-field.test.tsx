import { describe, expect, it } from 'vitest';
import {
  SearchField,
  searchFieldClassName,
  searchFieldTrailing,
} from './search-field.js';

describe('SearchField', () => {
  it('exports a component', () => {
    expect(typeof SearchField).toBe('function');
  });

  it('exports the base class name', () => {
    expect(searchFieldClassName).toBe('search-field');
  });

  it('shows clear only when there is text', () => {
    expect(searchFieldTrailing(false, '')).toEqual({ showClear: false });
    expect(searchFieldTrailing(false, '   ')).toEqual({ showClear: false });
    expect(searchFieldTrailing(true, '')).toEqual({ showClear: false });
    expect(searchFieldTrailing(false, 'near')).toEqual({ showClear: true });
    expect(searchFieldTrailing(true, 'near')).toEqual({ showClear: true });
  });
});
