import { describe, expect, it } from 'vitest';
import {
  overlayDismissShouldReplace,
  standingCloseAccountId,
  standingCloseLeavesToFace,
  standingCloseSkipsReveal,
} from './use-overlay-close';

describe('standingCloseLeavesToFace', () => {
  it('sends standing close to the portfolio', () => {
    expect(standingCloseLeavesToFace('/@alice.testnet/standing/incoming')).toBe(
      true
    );
    expect(standingCloseLeavesToFace('/@alice.testnet/standing/mutual')).toBe(
      true
    );
  });

  it('leaves other sheets on the history pop', () => {
    expect(standingCloseLeavesToFace('/@alice.testnet/network')).toBe(false);
    expect(standingCloseLeavesToFace('/@alice.testnet')).toBe(false);
    expect(standingCloseLeavesToFace('/@alice.testnet/discover')).toBe(false);
  });
});

describe('standingCloseAccountId', () => {
  it('uses the person in the address', () => {
    expect(
      standingCloseAccountId('/@bob.testnet/standing/incoming', 'alice.testnet')
    ).toBe('bob.testnet');
  });

  it('is null away from standing', () => {
    expect(
      standingCloseAccountId('/@bob.testnet/network', 'alice.testnet')
    ).toBeNull();
  });
});

describe('standingCloseSkipsReveal', () => {
  it('skips the reveal when the page under the sheet is the map', () => {
    expect(
      standingCloseSkipsReveal('/@bob.testnet/standing/incoming', ['network'])
    ).toBe(true);
    expect(
      standingCloseSkipsReveal('/@bob.testnet/standing/incoming', [])
    ).toBe(false);
    expect(standingCloseSkipsReveal('/@bob.testnet/network', ['network'])).toBe(
      false
    );
  });
});

describe('overlayDismissShouldReplace', () => {
  it('keeps a globe click on the map', () => {
    expect(
      overlayDismissShouldReplace(
        '/@bob.testnet/network',
        '/@bob.testnet/network'
      )
    ).toBe(false);
    expect(
      overlayDismissShouldReplace(
        '/@bob.testnet/standing/incoming',
        '/@bob.testnet/network'
      )
    ).toBe(false);
    expect(
      overlayDismissShouldReplace(
        '/@bob.testnet/network',
        '/@bob.testnet/standing/incoming'
      )
    ).toBe(false);
  });

  it('still closes standing onto the profile', () => {
    expect(
      overlayDismissShouldReplace(
        '/@bob.testnet/standing/incoming',
        '/@bob.testnet/standing/incoming'
      )
    ).toBe(true);
  });
});
