import { describe, expect, it } from 'vitest';
import { resolveThreadLayout, THREAD_LAYOUT_QUERY } from './thread-layout';

describe('resolveThreadLayout', () => {
  it('defaults to flow', () => {
    expect(resolveThreadLayout(new URLSearchParams())).toBe('flow');
    expect(resolveThreadLayout(null)).toBe('flow');
  });

  it('opts into legacy tabs via query param', () => {
    expect(
      resolveThreadLayout(new URLSearchParams(`${THREAD_LAYOUT_QUERY}=tabs`))
    ).toBe('tabs');
    expect(
      resolveThreadLayout(new URLSearchParams(`${THREAD_LAYOUT_QUERY}=flow`))
    ).toBe('flow');
    expect(
      resolveThreadLayout(new URLSearchParams(`${THREAD_LAYOUT_QUERY}=bogus`))
    ).toBe('flow');
  });
});
