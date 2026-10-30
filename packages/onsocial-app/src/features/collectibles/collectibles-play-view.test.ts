import { describe, expect, it } from 'vitest';
import {
  collectiblesPlayBackHref,
  playTransferOpen,
} from '@/features/collectibles/collectibles-play-view';

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

describe('playTransferOpen', () => {
  it('opens the sheet while sibling copies are still loading', () => {
    expect(playTransferOpen(null)).toBe('sheet');
  });

  it('opens the sheet for the edition on screen', () => {
    expect(playTransferOpen([{}])).toBe('sheet');
    expect(playTransferOpen([])).toBe('sheet');
  });

  it('opens the picker when several copies are already known', () => {
    expect(playTransferOpen([{}, {}])).toBe('picker');
  });
});
