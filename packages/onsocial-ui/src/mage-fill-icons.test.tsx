import { describe, expect, it } from 'vitest';
import { UserPlusFillIcon } from './mage-fill-icons.js';

describe('mage fill icons', () => {
  it('exports icon components', () => {
    expect(typeof UserPlusFillIcon).toBe('function');
  });
});
