import { describe, expect, it } from 'vitest';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  OS_INDEX_LEAVE_HREF,
  portfolioFaceOverlayLeaveHref,
  resolveOsLeave,
} from '@/lib/os-leave';

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

  it('sends daily indexes to Home, never the gate', () => {
    expect(OS_INDEX_LEAVE_HREF).toBe(APP_HOME_PATH);
    expect(OS_INDEX_LEAVE_HREF).not.toBe('/');
    expect(resolveOsLeave({ fallbackHref: OS_INDEX_LEAVE_HREF })).toEqual({
      kind: 'parent',
      href: APP_HOME_PATH,
    });
  });

  it('sends face overlays to the page, not Home', () => {
    expect(portfolioFaceOverlayLeaveHref('alice.testnet')).toBe(
      '/@alice.testnet'
    );
    expect(
      resolveOsLeave({
        fallbackHref: portfolioFaceOverlayLeaveHref('alice.testnet'),
      })
    ).toEqual({ kind: 'parent', href: '/@alice.testnet' });
  });
});
