import { describe, expect, it } from 'vitest';
import { ALLOWED_PROXY_ROUTES } from './allowed-proxy-routes';

describe('OnAPI proxy allowlist', () => {
  it('includes the scarce token read and the guild blacklist read', () => {
    const getPaths = ALLOWED_PROXY_ROUTES.filter(
      (route) => route.method === 'GET'
    ).map((route) => route.path);

    expect(getPaths).toContain('data/scarces-token');
    expect(getPaths).toContain('data/group-is-blacklisted');
  });
});
