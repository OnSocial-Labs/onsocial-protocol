import { describe, expect, it } from 'vitest';
import {
  buildAppHandoffUrl,
  buildOsAppHandoffUrl,
  parseAppHandoffFromUrl,
  stripAppHandoffFromUrl,
} from './auth-handoff.js';

describe('app handoff URL helpers', () => {
  it('parses code and app id from a listing URL', () => {
    expect(
      parseAppHandoffFromUrl(
        'https://track.example.com/app?onsocial_code=abc&onsocial_app=Tracker'
      )
    ).toEqual({ code: 'abc', appId: 'tracker' });
  });

  it('parses a search string and ignores a missing pair', () => {
    expect(
      parseAppHandoffFromUrl('?onsocial_code=abc&onsocial_app=tracker')
    ).toEqual({ code: 'abc', appId: 'tracker' });
    expect(parseAppHandoffFromUrl('https://track.example.com/app')).toBeNull();
  });

  it('appends handoff params without dropping the listing path', () => {
    expect(
      buildAppHandoffUrl('https://track.example.com/app?ref=1', {
        code: 'abc',
        appId: 'tracker',
      })
    ).toBe(
      'https://track.example.com/app?ref=1&onsocial_code=abc&onsocial_app=tracker'
    );
  });

  it('builds the OS continue URL and strips used codes', () => {
    expect(buildOsAppHandoffUrl('https://onsocial.id', 'Tracker')).toBe(
      'https://onsocial.id/handoff?app=tracker'
    );
    expect(
      stripAppHandoffFromUrl(
        'https://track.example.com/app?ref=1&onsocial_code=abc&onsocial_app=tracker'
      )
    ).toBe('/app?ref=1');
  });

  it('rejects an invalid community app id', () => {
    expect(
      parseAppHandoffFromUrl(
        'https://track.example.com/app?onsocial_code=abc&onsocial_app=../x'
      )
    ).toBeNull();
    expect(() => buildOsAppHandoffUrl('https://onsocial.id', '../x')).toThrow(
      /appId/
    );
  });
});
