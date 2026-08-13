import { describe, expect, it } from 'vitest';
import {
  osFieldBorderedClassName,
  osFieldClassName,
  osFieldSoftClassName,
} from './os-field.js';

describe('os-field class names', () => {
  it('exports stable chrome class names', () => {
    expect(osFieldBorderedClassName).toBe('os-field-bordered');
    expect(osFieldSoftClassName).toBe('os-field-soft');
    expect(osFieldClassName).toBe('os-field');
  });
});
