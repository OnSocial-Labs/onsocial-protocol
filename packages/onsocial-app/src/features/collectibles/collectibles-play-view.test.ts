import { describe, expect, it } from 'vitest';
import { collectiblesPlayBackHref } from '@/features/collectibles/collectibles-play-view';

describe('collectiblesPlayBackHref', () => {
  it('sends a signed-in viewer to their vault', () => {
    expect(collectiblesPlayBackHref('Alice.near')).toBe(
      '/@Alice.near/collectibles'
    );
  });

  it('sends a guest to the OS Collectibles hop', () => {
    expect(collectiblesPlayBackHref(null)).toBe('/collectibles');
    expect(collectiblesPlayBackHref('  ')).toBe('/collectibles');
  });
});
