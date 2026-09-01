import { describe, expect, it } from 'vitest';
import { classifyStoredSessionLifecycle } from '@/lib/app-social-session';

describe('classifyStoredSessionLifecycle', () => {
  const now = 1_700_000_000_000;

  it('returns missing when there is no stored session', () => {
    expect(classifyStoredSessionLifecycle(null, now)).toBe('missing');
  });

  it('returns active when expiry is in the future', () => {
    expect(
      classifyStoredSessionLifecycle({ expiresAtMs: now + 60_000 }, now)
    ).toBe('active');
  });

  it('returns active when no expiry is set', () => {
    expect(classifyStoredSessionLifecycle({ expiresAtMs: undefined }, now)).toBe(
      'active'
    );
  });

  it('returns expired when expiry is in the past', () => {
    expect(
      classifyStoredSessionLifecycle({ expiresAtMs: now - 1 }, now)
    ).toBe('expired');
  });
});
