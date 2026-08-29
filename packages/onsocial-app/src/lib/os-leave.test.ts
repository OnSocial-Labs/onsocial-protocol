import { describe, expect, it } from 'vitest';
import { resolveOsLeave } from '@/lib/os-leave';

describe('resolveOsLeave', () => {
  it('uses onBack for a stack pane (thread → inbox)', () => {
    expect(
      resolveOsLeave({
        onBack: () => undefined,
        fallbackHref: '/messages',
      })
    ).toEqual({ kind: 'callback' });
  });

  it('goes to the parent place, not browser history', () => {
    expect(resolveOsLeave({ fallbackHref: '/groups' })).toEqual({
      kind: 'parent',
      href: '/groups',
    });
  });
});
