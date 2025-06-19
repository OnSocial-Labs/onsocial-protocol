// tests/keystore.test.ts
import { describe, it, expect } from 'vitest';
import { Keystore } from '../src/keystore';

const key = 'test-key';
const value = 'test-value';

// NOTE: Skipped due to upstream ESM/JSON import or type import issues (see @near-js/types, @near-js/utils). Remove .skip when upstream is fixed.
describe.skip('Keystore', () => {
  it('set and get item', async () => {
    await Keystore.setItem(key, value);
    const stored = await Keystore.getItem(key);
    expect(stored).toBe(value);
  });

  it('remove item', async () => {
    await Keystore.setItem(key, value);
    await Keystore.removeItem(key);
    const stored = await Keystore.getItem(key);
    expect(stored).toBeNull();
  });
});
