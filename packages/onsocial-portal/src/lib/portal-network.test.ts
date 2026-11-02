import { describe, expect, it } from 'vitest';
import {
  isPortalSwapEnabled,
  isUnreleasedMainnetContract,
  parsePortalNetwork,
  portalNetworkProfile,
  resolvePortalNetwork,
  socialHandoffDestination,
} from '@/lib/portal-network';
import { emptyProtocolPulse } from '@/lib/protocol-pulse-metrics';

describe('portal network choice', () => {
  it('accepts only testnet and mainnet', () => {
    const previous = process.env.NEXT_PUBLIC_NEAR_NETWORK;
    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
    expect(parsePortalNetwork('mainnet')).toBe('mainnet');
    expect(parsePortalNetwork(' TESTNET ')).toBe('testnet');
    expect(parsePortalNetwork('betanet')).toBeNull();
    expect(resolvePortalNetwork(null)).toBe('testnet');
    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';
    expect(resolvePortalNetwork(undefined)).toBe('mainnet');
    process.env.NEXT_PUBLIC_NEAR_NETWORK = previous;
  });

  it('points mainnet at the public gateway, app, and live accounts', () => {
    const previous = process.env.NEXT_PUBLIC_NEAR_NETWORK;
    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
    const profile = portalNetworkProfile('mainnet');
    expect(profile.apiUrl).toBe('https://api.onsocial.id');
    expect(profile.appUrl).toBe('https://onsocial.id');
    expect(profile.contracts.token).toBe('token.onsocial.near');
    expect(profile.contracts.rewards).toBe('rewards.onsocial.near');
    expect(profile.contracts.treasury).toBe('treasury.onsocial.near');
    expect(profile.contracts.core).toBe('core.onsocial.near');
    process.env.NEXT_PUBLIC_NEAR_NETWORK = previous;
  });

  it('keeps swap on mainnet and marks unreleased social contracts', () => {
    expect(isPortalSwapEnabled('mainnet')).toBe(true);
    expect(isPortalSwapEnabled('testnet')).toBe(false);
    expect(isUnreleasedMainnetContract('mainnet', 'Core')).toBe(true);
    expect(isUnreleasedMainnetContract('mainnet', 'Boost')).toBe(true);
    expect(isUnreleasedMainnetContract('mainnet', 'Scarces')).toBe(true);
    expect(isUnreleasedMainnetContract('mainnet', 'Token')).toBe(false);
    expect(isUnreleasedMainnetContract('testnet', 'Core')).toBe(false);
  });
});

describe('social handoff', () => {
  const app = 'https://onsocial.id';

  it('sends portal social routes to the chosen app', () => {
    expect(socialHandoffDestination('/u/bob.testnet', app)).toBe(
      `${app}/@bob.testnet`
    );
    expect(socialHandoffDestination('/u/bob.testnet/network', app)).toBe(
      `${app}/@bob.testnet/network`
    );
    expect(socialHandoffDestination('/u/bob.testnet/endorsements', app)).toBe(
      `${app}/@bob.testnet/endorsements`
    );
    expect(
      socialHandoffDestination('/u/bob.testnet/endorsements/supporters', app)
    ).toBe(`${app}/@bob.testnet/endorsements`);
    expect(
      socialHandoffDestination('/u/bob.testnet/stand/solidarity', app)
    ).toBe(`${app}/@bob.testnet/standing/mutual`);
    expect(socialHandoffDestination('/u/bob.testnet/stand/standing', app)).toBe(
      `${app}/@bob.testnet/standing/incoming`
    );
    expect(
      socialHandoffDestination('/u/bob.testnet/stand/standings', app)
    ).toBe(`${app}/@bob.testnet/standing/incoming`);
    expect(socialHandoffDestination('/u/bob.testnet/stand/outgoing', app)).toBe(
      `${app}/@bob.testnet/standing/outgoing`
    );
    expect(socialHandoffDestination('/discover', app)).toBe(`${app}/discover`);
    expect(socialHandoffDestination('/boost', app)).toBe(
      `${app}/home?sheet=boost`
    );
    expect(socialHandoffDestination('/boost/leaderboard', app)).toBe(
      `${app}/home?sheet=boost`
    );
    expect(socialHandoffDestination('/season', app)).toBe(
      `${app}/home?sheet=rally`
    );
    expect(socialHandoffDestination('/season-zero', app)).toBe(
      `${app}/home?sheet=rally&season=season-zero`
    );
  });

  it('leaves portal admin routes alone', () => {
    expect(socialHandoffDestination('/season/admin', app)).toBeNull();
    expect(socialHandoffDestination('/season-zero/admin', app)).toBeNull();
    expect(socialHandoffDestination('/governance', app)).toBeNull();
  });
});

describe('empty protocol pulse', () => {
  it('keeps the profile strip numbers at zero', () => {
    const pulse = emptyProtocolPulse();
    expect(pulse.totals.profiles).toBe(0);
    expect(pulse.totals.groups).toBe(0);
    expect(pulse.recent24h.posts).toBe(0);
  });
});
