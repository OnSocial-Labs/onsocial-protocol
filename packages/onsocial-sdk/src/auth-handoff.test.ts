import { describe, expect, it } from 'vitest';
import { buildAppHandoffUrl, parseAppHandoffFromUrl } from './auth-handoff.js';

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
});
