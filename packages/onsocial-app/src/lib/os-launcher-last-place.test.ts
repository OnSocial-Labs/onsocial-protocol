import { afterEach, describe, expect, it } from 'vitest';
import {
  osLastPlaceFromPathname,
  osLastPlaceIsReturnable,
  osLastPlaceLauncherApp,
  readOsLastPlace,
  rememberOsLastPlaceFromPath,
  resetOsLastPlaceForTests,
  withOsLastPlaceApp,
} from '@/lib/os-launcher-last-place';

afterEach(() => {
  resetOsLastPlaceForTests();
});

describe('osLastPlaceFromPathname', () => {
  it('remembers a portfolio face', () => {
    expect(osLastPlaceFromPathname('/@alice.testnet')).toEqual({
      accountId: 'alice.testnet',
      href: '/@alice.testnet',
      label: '@alice.testnet',
    });
  });

  it('remembers page overlays as that face', () => {
    expect(osLastPlaceFromPathname('/@alice.testnet/about')?.href).toBe(
      '/@alice.testnet'
    );
  });

  it('skips Home, feed, and collectibles hops', () => {
    expect(osLastPlaceFromPathname('/home')).toBeNull();
    expect(osLastPlaceFromPathname('/@alice.testnet/feed')).toBeNull();
    expect(osLastPlaceFromPathname('/@alice.testnet/collectibles')).toBeNull();
    expect(osLastPlaceFromPathname('/groups')).toBeNull();
  });
});

describe('osLastPlaceIsReturnable', () => {
  const alice = osLastPlaceFromPathname('/@alice.testnet')!;

  it('shows after a hop to Home', () => {
    expect(osLastPlaceIsReturnable(alice, '/home', 'bob.testnet')).toBe(true);
  });

  it('hides while still on that page', () => {
    expect(
      osLastPlaceIsReturnable(alice, '/@alice.testnet/about', 'bob.testnet')
    ).toBe(false);
  });

  it('hides the viewer own page — launcher Page already covers it', () => {
    expect(osLastPlaceIsReturnable(alice, '/home', 'alice.testnet')).toBe(
      false
    );
  });
});

describe('rememberOsLastPlaceFromPath', () => {
  it('keeps the last page across a Home hop', () => {
    rememberOsLastPlaceFromPath('/@alice.testnet');
    expect(rememberOsLastPlaceFromPath('/home')).toBeNull();
    const last = readOsLastPlace()!;
    expect(last.href).toBe('/@alice.testnet');
    expect(osLastPlaceLauncherApp(last)).toMatchObject({
      id: 'last-place',
      href: '/@alice.testnet',
      kind: 'app',
    });
    expect(
      withOsLastPlaceApp(
        [{ id: 'home', label: 'Home', kind: 'app', href: '/home' }],
        last
      ).map((app) => app.id)
    ).toEqual(['last-place', 'home']);
  });
});
