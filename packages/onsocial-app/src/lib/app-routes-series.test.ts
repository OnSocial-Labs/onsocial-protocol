import { describe, expect, it } from 'vitest';
import {
  APP_APPS_PATH,
  APP_DROP_CREATE_PATH,
  APP_DROPS_PATH,
  APP_MARKET_PATH,
  APP_SERIES_PATH,
  dropCreateBackHref,
  dropCreatePath,
  seriesPagePath,
} from '@/lib/app-routes';

describe('seriesPagePath', () => {
  it('builds an encoded public series URL', () => {
    expect(seriesPagePath('alice.testnet', 'ink-studies')).toBe(
      `${APP_SERIES_PATH}/alice.testnet/ink-studies`
    );
    expect(seriesPagePath('a b.testnet', 'line one')).toBe(
      `${APP_SERIES_PATH}/${encodeURIComponent('a b.testnet')}/${encodeURIComponent('line one')}`
    );
  });

  it('falls back to Market when creator or series id is empty', () => {
    expect(seriesPagePath('', 'ink')).toBe(APP_MARKET_PATH);
    expect(seriesPagePath('alice.testnet', '  ')).toBe(APP_MARKET_PATH);
  });
});

describe('dropCreatePath', () => {
  it('stays on New drop and prefills a series name', () => {
    expect(dropCreatePath()).toBe(APP_DROP_CREATE_PATH);
    expect(dropCreatePath({ series: 'Night Roads' })).toBe(
      `${APP_DROP_CREATE_PATH}?series=Night+Roads`
    );
    expect(dropCreatePath({ series: '  ' })).toBe(APP_DROP_CREATE_PATH);
  });
});

describe('dropCreateBackHref', () => {
  it('leaves to Drops unless a hub is bound', () => {
    expect(dropCreateBackHref()).toBe(APP_DROPS_PATH);
    expect(dropCreateBackHref('  ')).toBe(APP_DROPS_PATH);
    expect(dropCreateBackHref('night-roads')).toBe(
      `${APP_APPS_PATH}/night-roads`
    );
    expect(dropCreateBackHref('a b')).toBe(
      `${APP_APPS_PATH}/${encodeURIComponent('a b')}`
    );
  });
});
