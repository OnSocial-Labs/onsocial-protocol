import { describe, expect, it } from 'vitest';
import {
  APP_DROPS_PATH,
  DROPS_SORT_PARAM,
  dropsPath,
  parseDropsSortParam,
} from '@/lib/app-routes';

describe('dropsPath', () => {
  it('returns bare /drops for default live', () => {
    expect(dropsPath()).toBe(APP_DROPS_PATH);
    expect(dropsPath({ sort: 'live' })).toBe(APP_DROPS_PATH);
  });

  it('deep-links saved, new, and other sorts', () => {
    expect(dropsPath({ sort: 'saved' })).toBe(
      `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=saved`
    );
    expect(dropsPath({ sort: 'loved' })).toBe(
      `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=loved`
    );
    expect(dropsPath({ sort: 'new' })).toBe(
      `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=new`
    );
    expect(dropsPath({ sort: 'upcoming' })).toBe(
      `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=upcoming`
    );
    expect(dropsPath({ sort: 'closing' })).toBe(
      `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=closing`
    );
  });
});

describe('parseDropsSortParam', () => {
  it('parses known sorts and defaults to live', () => {
    expect(parseDropsSortParam('saved')).toBe('saved');
    expect(parseDropsSortParam('upcoming')).toBe('upcoming');
    expect(parseDropsSortParam('finished')).toBe('finished');
    expect(parseDropsSortParam('closing')).toBe('closing');
    expect(parseDropsSortParam(null)).toBe('live');
    expect(parseDropsSortParam('nope')).toBe('live');
  });

  it('aliases minting and volume to live', () => {
    expect(parseDropsSortParam('Minting')).toBe('live');
    expect(parseDropsSortParam('volume')).toBe('live');
  });
});
