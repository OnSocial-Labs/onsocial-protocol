import { describe, expect, it } from 'vitest';
import { isOnApiSameOriginRequest } from '@/lib/onapi-proxy-origin';

describe('isOnApiSameOriginRequest', () => {
  it('allows missing Origin (same-origin navigations / curl)', () => {
    expect(
      isOnApiSameOriginRequest({
        origin: null,
        nextOrigin: 'http://0.0.0.0:3060',
        host: 'localhost:3060',
        protocol: 'http:',
      })
    ).toBe(true);
  });

  it('allows Origin that matches nextUrl.origin', () => {
    expect(
      isOnApiSameOriginRequest({
        origin: 'http://localhost:3060',
        nextOrigin: 'http://localhost:3060',
        host: 'localhost:3060',
        protocol: 'http:',
      })
    ).toBe(true);
  });

  it('allows localhost Origin when Next bound to 0.0.0.0', () => {
    expect(
      isOnApiSameOriginRequest({
        origin: 'http://localhost:3060',
        nextOrigin: 'http://0.0.0.0:3060',
        host: 'localhost:3060',
        protocol: 'http:',
      })
    ).toBe(true);
  });

  it('rejects a foreign site', () => {
    expect(
      isOnApiSameOriginRequest({
        origin: 'https://evil.example',
        nextOrigin: 'https://testnet.onsocial.id',
        host: 'testnet.onsocial.id',
        protocol: 'https:',
      })
    ).toBe(false);
  });

  it('uses forwarded host behind Caddy', () => {
    expect(
      isOnApiSameOriginRequest({
        origin: 'https://testnet.onsocial.id',
        nextOrigin: 'http://0.0.0.0:3060',
        host: '127.0.0.1:3060',
        forwardedHost: 'testnet.onsocial.id',
        forwardedProto: 'https',
        protocol: 'http:',
      })
    ).toBe(true);
  });
});
