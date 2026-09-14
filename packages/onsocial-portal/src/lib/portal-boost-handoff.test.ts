import { describe, expect, it } from 'vitest';
import {
  getPublicAppBoostUrl,
  getPublicAppPageUrl,
  PUBLIC_APP_URL,
} from '@/lib/portal-config';
import { resolveRouteNavBack } from '@/lib/nav-back-route';
import { TRANSPARENCY_ACTION_LINKS } from '@/features/transparency/transparency-constants';

describe('getPublicAppBoostUrl', () => {
  it('opens the owner Boost sheet when an account is connected', () => {
    expect(getPublicAppBoostUrl('alice.testnet')).toBe(
      `${getPublicAppPageUrl('alice.testnet')}?sheet=boost`
    );
  });

  it('keeps Boost intent on Home when nobody is connected', () => {
    expect(getPublicAppBoostUrl(null)).toBe(
      `${PUBLIC_APP_URL}/home?sheet=boost`
    );
    expect(getPublicAppBoostUrl('  ')).toBe(
      `${PUBLIC_APP_URL}/home?sheet=boost`
    );
  });
});

describe('boost handoff routes', () => {
  it('keeps /boost as a pulse handoff, not a lock action', () => {
    expect(resolveRouteNavBack('/boost')).toEqual({ label: 'Back' });
    expect(
      TRANSPARENCY_ACTION_LINKS.find((link) => link.label === 'Boost')
    ).toMatchObject({ href: '/boost', hint: 'Open' });
  });
});
