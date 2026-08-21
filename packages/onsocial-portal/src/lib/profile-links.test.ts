import { describe, expect, it } from 'vitest';
import {
  buildProfileLinkUrl,
  normalizeOnSocialAccountInput,
  normalizeProfileHandleInput,
  profileLinkDisplayItems,
  profileLinksInputFromRecord,
} from '@/lib/profile-links';
import { nearAccountPlaceholder } from '@/lib/portal-near-account';
import { getPublicAppPageUrl } from '@/lib/portal-config';

describe('profile linkedin links', () => {
  it('accepts path input after linkedin.com', () => {
    expect(
      normalizeProfileHandleInput('in/michael-smiglarski', 'linkedin')
    ).toBe('in/michael-smiglarski');
    expect(
      normalizeProfileHandleInput('company/near-protocol-project', 'linkedin')
    ).toBe('company/near-protocol-project');
  });

  it('accepts bare handle or full URL paste', () => {
    expect(normalizeProfileHandleInput('michael-smiglarski', 'linkedin')).toBe(
      'in/michael-smiglarski'
    );
    expect(
      normalizeProfileHandleInput(
        'https://www.linkedin.com/in/michael-smiglarski/',
        'linkedin'
      )
    ).toBe('in/michael-smiglarski');
  });

  it('keeps stored linkedin paths without re-parsing them as URLs', () => {
    expect(normalizeProfileHandleInput('in/112882388', 'linkedin')).toBe(
      'in/112882388'
    );
    expect(normalizeProfileHandleInput('company/112882388', 'linkedin')).toBe(
      'company/112882388'
    );
  });

  it('builds hrefs and shows profile icons', () => {
    expect(buildProfileLinkUrl('in/112882388', 'linkedin')).toBe(
      'https://linkedin.com/in/112882388'
    );
    expect(
      profileLinkDisplayItems({ linkedin: 'in/112882388' }).map(
        (item) => item.href
      )
    ).toEqual(['https://linkedin.com/in/112882388']);
  });
});

describe('profile onsocial links', () => {
  const sampleAccount = nearAccountPlaceholder().replace('account', 'alice');

  it('normalizes bare NEAR account ids', () => {
    expect(normalizeOnSocialAccountInput(sampleAccount)).toBe(sampleAccount);
    expect(normalizeOnSocialAccountInput(`@${sampleAccount}`)).toBe(
      sampleAccount
    );
  });

  it('extracts account id from OnSocial profile URLs', () => {
    expect(
      normalizeOnSocialAccountInput(
        `https://testnet.onsocial.id/@${sampleAccount}`
      )
    ).toBe(sampleAccount);
    expect(normalizeOnSocialAccountInput(`onsocial.id/@${sampleAccount}`)).toBe(
      sampleAccount
    );
  });

  it('rejects incomplete or wrong-network account ids', () => {
    expect(() => normalizeOnSocialAccountInput('alice')).toThrow(/complete/i);
    expect(() => normalizeOnSocialAccountInput('!!!')).toThrow();
  });

  it('builds public app page hrefs', () => {
    expect(buildProfileLinkUrl(sampleAccount, 'onsocial')).toBe(
      getPublicAppPageUrl(sampleAccount)
    );
    expect(
      profileLinkDisplayItems({ onsocial: sampleAccount }).map((item) => ({
        kind: item.kind,
        href: item.href,
        display: item.display,
      }))
    ).toEqual([
      {
        kind: 'onsocial',
        href: getPublicAppPageUrl(sampleAccount),
        display: sampleAccount,
      },
    ]);
  });

  it('loads onsocial from stored link records', () => {
    expect(
      profileLinksInputFromRecord({ onsocial: sampleAccount }).onsocial
    ).toBe(sampleAccount);
  });
});
