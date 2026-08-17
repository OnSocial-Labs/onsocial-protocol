import { describe, expect, it } from 'vitest';
import {
  APP_DROPS_PATH,
  DROPS_SORT_PARAM,
  MARKET_AUDIO_FORMAT_PARAM,
  MARKET_KIND_PARAM,
  dropsPath,
  parseDropsMediumParam,
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

  it('deep-links medium kind and combines with sort', () => {
    expect(dropsPath({ kind: 'ticket' })).toBe(
      `${APP_DROPS_PATH}?${MARKET_KIND_PARAM}=ticket`
    );
    expect(dropsPath({ sort: 'upcoming', kind: 'audio' })).toBe(
      `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=upcoming&${MARKET_KIND_PARAM}=audio`
    );
    expect(dropsPath({ sort: 'live', kind: 'all' })).toBe(APP_DROPS_PATH);
  });

  it('deep-links audio format only under Audio medium', () => {
    expect(dropsPath({ kind: 'audio', audioFormat: 'album' })).toBe(
      `${APP_DROPS_PATH}?${MARKET_KIND_PARAM}=audio&${MARKET_AUDIO_FORMAT_PARAM}=album`
    );
    expect(dropsPath({ kind: 'ticket', audioFormat: 'album' })).toBe(
      `${APP_DROPS_PATH}?${MARKET_KIND_PARAM}=ticket`
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

describe('parseDropsMediumParam', () => {
  it('parses Drops rail mediums and defaults to all', () => {
    expect(parseDropsMediumParam('ticket')).toBe('ticket');
    expect(parseDropsMediumParam('audio')).toBe('audio');
    expect(parseDropsMediumParam('music')).toBe('audio');
    expect(parseDropsMediumParam('coupon')).toBe('all');
    expect(parseDropsMediumParam(null)).toBe('all');
  });
});
