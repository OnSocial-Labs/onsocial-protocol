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
      dismissSide: 'leading',
    });
    expect(searchFieldTrailing(false, '   ')).toEqual({
      showClear: false,
      showDismiss: false,
      dismissSide: 'leading',
    });
  });

  it('puts dismiss on the left while focused; clear stays on the right', () => {
    expect(searchFieldTrailing(false, 'near')).toEqual({
      showClear: true,
      showDismiss: false,
      dismissSide: 'leading',
    });
    expect(searchFieldTrailing(true, '')).toEqual({
      showClear: false,
      showDismiss: true,
      dismissSide: 'leading',
    });
    expect(searchFieldTrailing(true, 'near')).toEqual({
      showClear: true,
      showDismiss: true,
      dismissSide: 'leading',
    });
  });
});
