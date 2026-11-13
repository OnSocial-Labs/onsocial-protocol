import { describe, expect, it } from 'vitest';
import { resolveViewportDebug } from './viewport-debug-flag';

describe('resolveViewportDebug', () => {
  it('turns on from the query and remembers it', () => {
    expect(resolveViewportDebug('1', null)).toEqual({
      enabled: true,
      persist: '1',
    });
  });

  it('turns off from the query', () => {
    expect(resolveViewportDebug('0', '1')).toEqual({
      enabled: false,
      persist: '0',
    });
  });

  it('keeps the stored choice when the query is absent', () => {
    expect(resolveViewportDebug(null, '1')).toEqual({
      enabled: true,
      persist: null,
    });
    expect(resolveViewportDebug(null, null)).toEqual({
      enabled: false,
      persist: null,
    });
  });
});
