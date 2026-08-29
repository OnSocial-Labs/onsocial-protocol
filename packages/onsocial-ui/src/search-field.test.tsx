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

  it('hides trailing controls when idle and empty', () => {
    expect(searchFieldTrailing(false, '')).toEqual({
      showClear: false,
      showDismiss: false,
    });
    expect(searchFieldTrailing(false, '   ')).toEqual({
      showClear: false,
      showDismiss: false,
    });
  });

  it('shows clear when there is a query, dismiss only while focused', () => {
    expect(searchFieldTrailing(false, 'near')).toEqual({
      showClear: true,
      showDismiss: false,
    });
    expect(searchFieldTrailing(true, '')).toEqual({
      showClear: false,
      showDismiss: true,
    });
    expect(searchFieldTrailing(true, 'near')).toEqual({
      showClear: true,
      showDismiss: true,
    });
  });
});
