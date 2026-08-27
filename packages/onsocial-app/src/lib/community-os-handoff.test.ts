import { describe, expect, it } from 'vitest';
import { isAppRoutePath } from '@/lib/app-routes';
import { parseCommunityOsHandoffAppId } from '@/lib/community-os-handoff';

describe('parseCommunityOsHandoffAppId', () => {
  it('reads a listed app id from the OS handoff query', () => {
    expect(parseCommunityOsHandoffAppId('Tracker')).toBe('tracker');
    expect(parseCommunityOsHandoffAppId(['tracker'])).toBe('tracker');
    expect(parseCommunityOsHandoffAppId('')).toBeNull();
    expect(parseCommunityOsHandoffAppId('../x')).toBeNull();
  });

  it('registers /handoff as an app shell path', () => {
    expect(isAppRoutePath('/handoff')).toBe(true);
  });
});
