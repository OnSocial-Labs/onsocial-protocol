import { describe, expect, it } from 'vitest';
import { UserPlusFillIcon, DotsCircleFillIcon } from './mage-fill-icons.js';

describe('mage fill icons', () => {
  it('exports icon components', () => {
    expect(typeof UserPlusFillIcon).toBe('function');
    expect(typeof DotsCircleFillIcon).toBe('function');
  });
});
