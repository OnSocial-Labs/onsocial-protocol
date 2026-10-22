import { describe, expect, it } from 'vitest';
import {
  previousOsInAppHref,
  reduceOsInAppTrail,
} from '@/lib/os-in-app-trail';

describe('os in-app trail', () => {
  it('keeps the list under a player after the player closes', () => {
    let trail = reduceOsInAppTrail([], '/@ada.near?tab=collection', false);
    trail = reduceOsInAppTrail(trail, '/@ada.near/collectibles', false);
    trail = reduceOsInAppTrail(
      trail,
      '/collectibles/play?play=night-drive',
      false
    );
    expect(previousOsInAppHref(trail)).toBe('/@ada.near/collectibles');
    trail = reduceOsInAppTrail(trail, '/@ada.near/collectibles', true);
    expect(trail).toEqual([
      '/@ada.near?tab=collection',
      '/@ada.near/collectibles',
    ]);
    expect(previousOsInAppHref(trail)).toBe('/@ada.near?tab=collection');
  });

  it('remembers another face when the vault is not that face', () => {
    let trail = reduceOsInAppTrail([], '/@them.near?tab=collection', false);
    trail = reduceOsInAppTrail(trail, '/@you.near/collectibles', false);
    expect(previousOsInAppHref(trail)).toBe('/@them.near?tab=collection');
  });
});
