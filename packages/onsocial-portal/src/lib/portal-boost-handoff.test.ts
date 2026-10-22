import { describe, expect, it } from 'vitest';
import {
  getPublicAppBoostUrl,
  getPublicAppPageUrl,
  PUBLIC_APP_URL,
} from '@/lib/portal-config';
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

describe('boost protocol routes', () => {
  it('sends Boost to the app, not a portal ranking', () => {
    expect(
      TRANSPARENCY_ACTION_LINKS.find((link) => link.label === 'Boost')
    ).toMatchObject({ href: getPublicAppBoostUrl(null), hint: 'Open' });
  });
});
