import { describe, expect, it } from 'vitest';
import { PulsingDots } from './pulsing-dots.js';

describe('PulsingDots', () => {
  it('exports a component', () => {
    expect(typeof PulsingDots).toBe('function');
  });
});
