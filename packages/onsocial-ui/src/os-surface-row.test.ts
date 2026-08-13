import { describe, expect, it } from 'vitest';
import {
  OsSurfaceRow,
  OsSurfaceRowList,
  osSurfaceRowArrowClassName,
  osSurfaceRowClassName,
  osSurfaceRowListClassName,
  osSurfaceRowNavigateClassName,
} from './os-surface-row.js';

describe('OsSurfaceRow', () => {
  it('exports stable class tokens', () => {
    expect(osSurfaceRowListClassName).toBe('os-surface-row-list');
    expect(osSurfaceRowClassName).toBe('os-surface-row');
    expect(osSurfaceRowNavigateClassName).toBe('os-surface-row--navigate');
    expect(osSurfaceRowArrowClassName).toBe('os-surface-row-arrow');
  });

  it('exports list + row components', () => {
    expect(typeof OsSurfaceRowList).toBe('function');
    expect(typeof OsSurfaceRow).toBe('function');
  });
});
