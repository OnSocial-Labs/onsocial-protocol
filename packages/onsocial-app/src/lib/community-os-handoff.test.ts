import { describe, expect, it } from 'vitest';
import { isAppRoutePath } from '@/lib/app-routes';
import {
  parseCommunityOsHandoffAppId,
  parseCommunityOsHandoffPublicKey,
} from '@/lib/community-os-handoff';

describe('community OS handoff query', () => {
  it('reads a listed app id from the OS handoff query', () => {
    expect(parseCommunityOsHandoffAppId('Tracker')).toBe('tracker');
    expect(parseCommunityOsHandoffAppId(['tracker'])).toBe('tracker');
    expect(parseCommunityOsHandoffAppId('')).toBeNull();
    expect(parseCommunityOsHandoffAppId('../x')).toBeNull();
  });

  it('accepts only an ed25519 public key', () => {
    expect(parseCommunityOsHandoffPublicKey('')).toBeNull();
    expect(parseCommunityOsHandoffPublicKey('not-a-key')).toBeNull();
    expect(
      parseCommunityOsHandoffPublicKey(
        'ed25519:11111111111111111111111111111111'
      )
    ).toBe('ed25519:11111111111111111111111111111111');
  });

  it('registers /handoff as an app shell path', () => {
    expect(isAppRoutePath('/handoff')).toBe(true);
  });
});
