import { describe, expect, it } from 'vitest';
import {
  buildPathWithQuery,
  replaceBrowserQueryUrl,
} from './sync-browser-url-query';

describe('buildPathWithQuery', () => {
  it('returns pathname when params are empty', () => {
    expect(buildPathWithQuery('/discover', new URLSearchParams())).toBe(
      '/discover'
    );
  });

  it('appends encoded query string', () => {
    const params = new URLSearchParams();
    params.set('q', 'test user');
    expect(buildPathWithQuery('/discover', params)).toBe(
      '/discover?q=test+user'
    );
  });
});

describe('replaceBrowserQueryUrl', () => {
  it('returns false in non-browser environments', () => {
    expect(replaceBrowserQueryUrl('/discover', new URLSearchParams())).toBe(
      false
    );
  });
});
