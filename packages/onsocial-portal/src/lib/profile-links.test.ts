import { describe, expect, it } from 'vitest';
import {
  buildProfileLinkUrl,
  normalizeProfileHandleInput,
  profileLinkDisplayItems,
} from '@/lib/profile-links';

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
