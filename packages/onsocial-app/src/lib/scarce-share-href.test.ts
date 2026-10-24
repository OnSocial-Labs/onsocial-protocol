import { describe, expect, it } from 'vitest';
import { scarceClipShareHref } from '@/lib/scarce-share-href';

const ORIGIN = 'https://app.example';

describe('scarceClipShareHref', () => {
  it('keeps the player token when an edition is open', () => {
    expect(
      scarceClipShareHref(
        'night-drive',
        `${ORIGIN}/collectibles/play?c=night-drive&t=night-drive%3A2`
      )
    ).toBe(`${ORIGIN}/collectibles/play?c=night-drive&t=night-drive%3A2`);
  });

  it('shares the drop page from the player when no edition is open', () => {
    expect(
      scarceClipShareHref(
        'night-drive',
        `${ORIGIN}/collectibles/play?c=night-drive`
      )
    ).toBe(`${ORIGIN}/collection/night-drive`);
  });

  it('leaves the drop page and other surfaces unchanged', () => {
    expect(
      scarceClipShareHref('night-drive', `${ORIGIN}/collection/night-drive`)
    ).toBe(`${ORIGIN}/collection/night-drive`);
    expect(
      scarceClipShareHref(
        'night-drive',
        `${ORIGIN}/collection/night-drive?pass=1&t=night-drive%3A2`
      )
    ).toBe(`${ORIGIN}/collection/night-drive?pass=1&t=night-drive%3A2`);
    expect(
      scarceClipShareHref('night-drive', `${ORIGIN}/alice.near/post/1`)
    ).toBe(`${ORIGIN}/alice.near/post/1`);
  });
});
