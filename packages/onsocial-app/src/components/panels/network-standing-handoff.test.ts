import { afterEach, describe, expect, it } from 'vitest';
import {
  armNetworkStandingHandoff,
  armStandingCloseCover,
  clearNetworkStandingHandoff,
  clearStandingSheetCovered,
  getNetworkStandingHandoffOpenTarget,
  getNetworkStandingHandoffPhase,
  getStandingOpeningFace,
  isStandingHandoffPortfolioFace,
  markStandingSheetCovered,
  networkStandingHandoffBlocksFace,
  peekNetworkStandingHandoff,
  pickLiveOsAppScreen,
  rememberStandingOpeningFace,
  standingSheetAlreadyCovered,
  takeNetworkStandingHandoff,
} from './network-standing-handoff';

const href = '/@bob.testnet/standing/incoming?q=bo';

afterEach(() => {
  clearNetworkStandingHandoff();
  clearStandingSheetCovered();
});

describe('network standing handoff', () => {
  it('opens only for the account the list was armed for', () => {
    armNetworkStandingHandoff({ accountId: 'bob.testnet', href }, 1_000);
    expect(peekNetworkStandingHandoff('alice.testnet', 1_100)).toBeNull();
    expect(takeNetworkStandingHandoff('bob.testnet', 1_100)).toBe(href);
    expect(takeNetworkStandingHandoff('bob.testnet', 1_100)).toBeNull();
    expect(getNetworkStandingHandoffPhase(1_100)).toBe('open');
  });

  it('drops a list that was never resumed', () => {
    armNetworkStandingHandoff({ accountId: 'bob.testnet', href }, 1_000);
    expect(peekNetworkStandingHandoff('bob.testnet', 12_000)).toBeNull();
    expect(getNetworkStandingHandoffPhase(12_000)).toBeNull();
  });

  it('keeps the list href after the portfolio push starts', () => {
    armNetworkStandingHandoff(
      {
        accountId: 'bob.testnet',
        href,
        displayName: 'Bob',
        avatarUrl: null,
      },
      1_000
    );
    takeNetworkStandingHandoff('bob.testnet', 1_100);
    expect(getNetworkStandingHandoffOpenTarget(1_100)).toEqual({
      accountId: 'bob.testnet',
      displayName: 'Bob',
      avatarUrl: null,
      href,
    });
    expect(getNetworkStandingHandoffOpenTarget(12_000)).toBeNull();
  });

  it('remembers the map subject so the standing sheet can open with their name', () => {
    rememberStandingOpeningFace({
      accountId: 'bob.testnet',
      displayName: 'Bob',
      avatarUrl: null,
      subjectIsViewer: true,
    });
    expect(getStandingOpeningFace('bob.testnet')?.displayName).toBe('Bob');
    expect(getStandingOpeningFace('bob.testnet')?.subjectIsViewer).toBe(true);
    expect(getStandingOpeningFace('alice.testnet')).toBeNull();
  });

  it('treats the bare portfolio as the close destination', () => {
    expect(isStandingHandoffPortfolioFace('/@bob.testnet', 'bob.testnet')).toBe(
      true
    );
    expect(
      isStandingHandoffPortfolioFace(
        '/@bob.testnet/standing/incoming',
        'bob.testnet'
      )
    ).toBe(false);
    armStandingCloseCover('bob.testnet', 1_000);
    expect(getNetworkStandingHandoffPhase(1_100)).toBe('close');
  });

  it('keeps the handoff on the armed face and the map that started it', () => {
    armNetworkStandingHandoff({ accountId: 'bob.testnet', href }, 1_000);
    expect(
      networkStandingHandoffBlocksFace('/@alice.testnet/network', 1_100)
    ).toBe(true);
    expect(networkStandingHandoffBlocksFace('/@bob.testnet', 1_100)).toBe(
      true
    );
    takeNetworkStandingHandoff('bob.testnet', 1_100);
    expect(networkStandingHandoffBlocksFace('/home', 1_200)).toBe(false);
    expect(
      networkStandingHandoffBlocksFace('/@alice.testnet', 1_200)
    ).toBe(false);
    expect(
      networkStandingHandoffBlocksFace('/@bob.testnet/standing/incoming', 1_200)
    ).toBe(true);
  });

  it('freezes the live map, not the parked home feed', () => {
    const feed = {
      closest: (selector: string) =>
        selector.includes('covered') ? feed : null,
    };
    const map = { closest: () => null };
    const held = { closest: (selector: string) => (selector.startsWith('#') ? held : null) };
    expect(pickLiveOsAppScreen([feed, map])).toBe(map);
    expect(pickLiveOsAppScreen([feed, held])).toBeNull();
    expect(pickLiveOsAppScreen([feed])).toBeNull();
  });

  it('remembers that the standing sheet already covered the map', () => {
    expect(standingSheetAlreadyCovered()).toBe(false);
    markStandingSheetCovered();
    expect(standingSheetAlreadyCovered()).toBe(true);
    clearStandingSheetCovered();
    expect(standingSheetAlreadyCovered()).toBe(false);
  });
});
