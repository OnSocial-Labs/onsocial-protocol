import { describe, expect, it } from 'vitest';
import {
  dropFanIdsFromReactions,
  isDropListFanPath,
} from '@/lib/scarce-drop-fans';

describe('drop list fans', () => {
  it('keeps loves on this drop and its tracks', () => {
    expect(isDropListFanPath('night', 'scarce/night')).toBe(true);
    expect(isDropListFanPath('night', 'alice.near/scarce/night')).toBe(true);
    expect(isDropListFanPath('night', 'alice.near/scarce/night/')).toBe(true);
    expect(
      isDropListFanPath('night', 'alice.near/scarce/night/track/bafk')
    ).toBe(true);
    expect(isDropListFanPath('night', 'alice.near/scarce/night-drive')).toBe(
      false
    );
    expect(
      isDropListFanPath('night', 'alice.near/scarce/night-drive/track/bafk')
    ).toBe(false);
    expect(isDropListFanPath('night', 'alice.near/post/1')).toBe(false);
  });

  it('lists each fan once and leaves the creator out', () => {
    expect(
      dropFanIdsFromReactions(
        [
          { accountId: 'ada.near', path: 'bob.near/scarce/night/track/a' },
          { accountId: 'ada.near', path: 'bob.near/scarce/night' },
          { accountId: ' bob.near ', path: 'bob.near/scarce/night' },
          { accountId: 'cy.near', path: 'bob.near/scarce/other' },
          { accountId: '', path: 'bob.near/scarce/night' },
          { accountId: 'bo.near', path: 'bob.near/scarce/night/track/b' },
        ],
        'night',
        'bob.near'
      )
    ).toEqual(['ada.near', 'bo.near']);
  });
});
