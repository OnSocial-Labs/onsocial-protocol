import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_ACCOUNT_HUES,
  protocolAccountHue,
} from '@/features/protocol/protocol-account-hue';

describe('protocolAccountHue', () => {
  it('returns a stable protocol hue for an account', () => {
    const a = protocolAccountHue('alice.near');
    const b = protocolAccountHue('alice.near');
    expect(a).toBe(b);
    expect(PROTOCOL_ACCOUNT_HUES).toContain(a);
  });

  it('is case-insensitive', () => {
    expect(protocolAccountHue('Bob.near')).toBe(protocolAccountHue('bob.near'));
  });
});
