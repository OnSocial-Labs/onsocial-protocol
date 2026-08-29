import { describe, expect, it } from 'vitest';
import { advanceOsArrival, normalizeOsPath, rootLeaveHref } from '@/lib/os-arrival';

describe('os arrival', () => {
  it('treats / as Home', () => {
    expect(normalizeOsPath('/')).toBe('/home');
    expect(normalizeOsPath('/home/')).toBe('/home');
  });

  it('first paint on Home has no leave', () => {
    const next = advanceOsArrival(null, null, '/home');
    expect(next.from).toBeNull();
    expect(rootLeaveHref('/home', next.from)).toBeNull();
  });

  it('Market → Home offers leave back to Market', () => {
    const atMarket = advanceOsArrival(null, null, '/market');
    const atHome = advanceOsArrival(atMarket.last, atMarket.from, '/home');
    expect(rootLeaveHref('/home', atHome.from)).toBe('/market');
  });

  it('Home → Discover offers leave back to Home', () => {
    const atHome = advanceOsArrival(null, null, '/home');
    const atDiscover = advanceOsArrival(atHome.last, atHome.from, '/discover');
    expect(rootLeaveHref('/discover', atDiscover.from)).toBe('/home');
  });

  it('staying on Home (re-render) keeps the arrival', () => {
    const atMarket = advanceOsArrival(null, null, '/market');
    const atHome = advanceOsArrival(atMarket.last, atMarket.from, '/home');
    const again = advanceOsArrival(atHome.last, atHome.from, '/home');
    expect(rootLeaveHref('/home', again.from)).toBe('/market');
  });
});
