import { describe, expect, it } from 'vitest';
import {
  buildPageUrl,
  normalizeHost,
  resolvePageHost,
} from './server-utils.js';

const reserved = new Set(['www', 'app', 'api', 'portal', 'testnet']);

describe('server-utils', () => {
  it('normalizes hostnames by removing ports', () => {
    expect(normalizeHost('Alice.OnSocial.ID:3456')).toBe('alice.onsocial.id');
  });

  it('resolves mainnet-style hosts using the configured base domain', () => {
    expect(
      resolvePageHost({
        host: 'alice.onsocial.id',
        publicPageBaseDomain: 'onsocial.id',
        accountSuffix: '.testnet',
        reservedSubdomains: reserved,
      })
    ).toEqual({
      accountId: 'alice.testnet',
      hostname: 'alice.onsocial.id',
      subdomain: 'alice',
    });
  });

  it('resolves testnet-specific page domains when configured', () => {
    expect(
      resolvePageHost({
        host: 'alice.testnet.onsocial.id',
        publicPageBaseDomain: 'testnet.onsocial.id',
        accountSuffix: '.testnet',
        reservedSubdomains: reserved,
      })
    ).toEqual({
      accountId: 'alice.testnet',
      hostname: 'alice.testnet.onsocial.id',
      subdomain: 'alice',
    });
  });

  it('rejects reserved subdomains and non-matching hosts', () => {
    expect(
      resolvePageHost({
        host: 'portal.onsocial.id',
        publicPageBaseDomain: 'onsocial.id',
        accountSuffix: '.near',
        reservedSubdomains: reserved,
      })
    ).toBeNull();

    expect(
      resolvePageHost({
        host: 'alice.other.id',
        publicPageBaseDomain: 'onsocial.id',
        accountSuffix: '.near',
        reservedSubdomains: reserved,
      })
    ).toBeNull();
  });

  it('builds page URLs from the configured base domain', () => {
    expect(buildPageUrl('alice.testnet', 'testnet.onsocial.id')).toBe(
      'https://alice.testnet.onsocial.id'
    );
    expect(buildPageUrl('alice.near', 'onsocial.id')).toBe(
      'https://alice.onsocial.id'
    );
  });
});
