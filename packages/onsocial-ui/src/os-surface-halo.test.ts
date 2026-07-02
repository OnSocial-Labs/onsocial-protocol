import { describe, expect, it } from 'vitest';
import { osSurfaceHaloClassName, OsSurfaceHalo } from './os-surface-halo.js';

describe('OsSurfaceHalo', () => {
  it('exports shared class names', () => {
    expect(osSurfaceHaloClassName).toBe('os-surface-halo');
  });

  it('exports the surface component', () => {
    expect(typeof OsSurfaceHalo).toBe('function');
  });
});
