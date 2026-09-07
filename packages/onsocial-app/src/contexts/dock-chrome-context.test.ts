import { describe, expect, it } from 'vitest';
import {
  resolveDockBackVisible,
  resolveDockConnectHintVisible,
} from '@/contexts/dock-chrome-context';

describe('resolveDockBackVisible', () => {
  it('shows dock back when registered and idle', () => {
    expect(
      resolveDockBackVisible({
        dockBack: { fallbackHref: '/home' },
        launcherOpen: false,
      })
    ).toBe(true);
  });

  it('hides dock back while the launcher is open', () => {
    expect(
      resolveDockBackVisible({
        dockBack: { fallbackHref: '/home' },
        launcherOpen: true,
      })
    ).toBe(false);
  });
});

describe('resolveDockConnectHintVisible', () => {
  it('shows the dock hint only when disconnected and the header does not own Connect', () => {
    expect(
      resolveDockConnectHintVisible({
        headerOwnsConnect: false,
        isConnected: false,
      })
    ).toBe(true);
    expect(
      resolveDockConnectHintVisible({
        headerOwnsConnect: true,
        isConnected: false,
      })
    ).toBe(false);
    expect(
      resolveDockConnectHintVisible({
        headerOwnsConnect: false,
        isConnected: true,
      })
    ).toBe(false);
  });
});
