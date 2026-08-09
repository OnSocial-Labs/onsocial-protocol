import { describe, expect, it } from 'vitest';
import {
  APP_DROPS_PATH,
  DROPS_SORT_PARAM,
  dropsPath,
  parseDropsSortParam,
} from '@/lib/app-routes';

describe('dropsPath', () => {
  it('returns bare /drops for default new', () => {
    expect(dropsPath()).toBe(APP_DROPS_PATH);
    expect(dropsPath({ sort: 'new' })).toBe(APP_DROPS_PATH);
  });

  it('deep-links saved and other sorts', () => {
    expect(dropsPath({ sort: 'saved' })).toBe(
      `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=saved`
    );
    expect(dropsPath({ sort: 'loved' })).toBe(
      `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=loved`
    );
  });
});

describe('parseDropsSortParam', () => {
  it('parses known sorts and falls back to new', () => {
    expect(parseDropsSortParam('saved')).toBe('saved');
    expect(parseDropsSortParam('Minting')).toBe('minting');
    expect(parseDropsSortParam(null)).toBe('new');
    expect(parseDropsSortParam('nope')).toBe('new');
  });
});
