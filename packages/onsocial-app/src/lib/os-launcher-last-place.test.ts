import { afterEach, describe, expect, it } from 'vitest';
import {
  osLastPlaceFromPathname,
  osLastPlaceIsReturnable,
  osLastPlaceLauncherApp,
  patchOsLastPlaceFace,
  readOsLastPlace,
  rememberOsLastPlaceFromPath,
  resetOsLastPlaceForTests,
  resolveOsLastPlaceSpokenLabel,
} from '@/lib/os-launcher-last-place';

afterEach(() => {
  resetOsLastPlaceForTests();
});

describe('osLastPlaceFromPathname', () => {
  it('remembers a portfolio face with a spoken label', () => {
    expect(osLastPlaceFromPathname('/@alice.testnet')).toEqual({
      accountId: 'alice.testnet',
      href: '/@alice.testnet',
      label: 'Alice',
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

  it('skips DAO and protocol faces, including overlays', () => {
    expect(osLastPlaceFromPathname('/@governance.onsocial.testnet')).toBeNull();
    expect(
      osLastPlaceFromPathname('/@governance.onsocial.testnet/about')
    ).toBeNull();
    expect(osLastPlaceFromPathname('/@alice.sputnikv2.testnet')).toBeNull();
  });
});

describe('resolveOsLastPlaceSpokenLabel', () => {
  it('speaks the local part, then a chosen profile name', () => {
    expect(resolveOsLastPlaceSpokenLabel('alice.testnet')).toBe('Alice');
    expect(resolveOsLastPlaceSpokenLabel('alice.testnet', 'Night')).toBe(
      'Night'
    );
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
    expect(last.label).toBe('Alice');
    expect(osLastPlaceLauncherApp(last)).toMatchObject({
      id: 'last-place',
      href: '/@alice.testnet',
      kind: 'app',
    });
  });

  it('patches a chosen name onto the remembered face', () => {
    rememberOsLastPlaceFromPath('/@alice.testnet');
    patchOsLastPlaceFace('alice.testnet', { profileName: 'Night' });
    expect(readOsLastPlace()?.label).toBe('Night');
    expect(
      resolveOsLastPlaceSpokenLabel(
        'alice.testnet',
        readOsLastPlace()?.profileName
      )
    ).toBe('Night');
  });
});
