import { describe, expect, it } from 'vitest';
import {
  PERMISSION_LEVEL,
  buildSessionKeyGrantAction,
  buildSetKeyPermissionAction,
} from './actions.js';

describe('session key grants', () => {
  it('defaults to 24h WRITE-level grant', () => {
    const now = 1_700_000_000_000;
    const action = buildSessionKeyGrantAction({
      publicKey: 'ed25519:abc',
      path: 'profile',
      now,
    });

    expect(action).toEqual({
      type: 'set_key_permission',
      public_key: 'ed25519:abc',
      path: 'profile',
      level: PERMISSION_LEVEL.WRITE,
      expires_at: String(now + 24 * 60 * 60 * 1000),
    });
  });

  it('respects custom level and ttl', () => {
    const now = 1_700_000_000_000;
    const action = buildSessionKeyGrantAction({
      publicKey: 'ed25519:abc',
      path: 'apps/myapp',
      level: PERMISSION_LEVEL.MANAGE,
      ttlMs: 60_000,
      now,
    });

    expect(action).toEqual({
      type: 'set_key_permission',
      public_key: 'ed25519:abc',
      path: 'apps/myapp',
      level: PERMISSION_LEVEL.MANAGE,
      expires_at: String(now + 60_000),
    });
  });

  it('matches buildSetKeyPermissionAction output', () => {
    const now = 1_700_000_000_000;
    const grant = buildSessionKeyGrantAction({
      publicKey: 'ed25519:abc',
      path: 'profile',
      now,
    });
    const direct = buildSetKeyPermissionAction({
      publicKey: 'ed25519:abc',
      path: 'profile',
      level: PERMISSION_LEVEL.WRITE,
      expiresAtMs: now + 24 * 60 * 60 * 1000,
    });

    expect(grant).toEqual(direct);
  });
});
