import { describe, expect, it } from 'vitest';
import { Divider } from './divider.js';

describe('Divider', () => {
  it('exports a component', () => {
    expect(typeof Divider).toBe('function');
  });
});
