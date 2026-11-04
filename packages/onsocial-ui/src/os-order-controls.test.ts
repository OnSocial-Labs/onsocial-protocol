import { describe, expect, it } from 'vitest';
import {
  OsOrderControls,
  osOrderControlsClassName,
} from './os-order-controls.js';

describe('OsOrderControls', () => {
  it('exports stable class token + component', () => {
    expect(osOrderControlsClassName).toBe('os-order-controls');
    expect(typeof OsOrderControls).toBe('function');
  });
});
