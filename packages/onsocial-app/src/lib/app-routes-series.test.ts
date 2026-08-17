import { describe, expect, it } from 'vitest';
import {
  APP_MARKET_PATH,
  APP_SERIES_PATH,
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
