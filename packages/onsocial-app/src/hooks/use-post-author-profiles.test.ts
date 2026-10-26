import { describe, expect, it, vi } from 'vitest';
import {
  seedPostAuthorProfile,
  seedPostAuthorProfilesFromFeed,
  subscribePostAuthorProfiles,
} from './use-post-author-profiles';

describe('post author profile seeding', () => {
  it('notifies subscribers only when asked and only on change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePostAuthorProfiles(listener);

    // Render-phase contract: writes without notify stay silent — snapshot
    // reads in the same render pass pick them up instead.
    seedPostAuthorProfile({
      accountId: 'seed-one.testnet',
      displayName: 'One',
      avatarUrl: null,
    });
    expect(listener).not.toHaveBeenCalled();

    // Unchanged reseed is a no-op even with notify — subscribers must not
    // wake for identity-preserving writes.
    seedPostAuthorProfile(
      { accountId: 'seed-one.testnet', displayName: 'One', avatarUrl: null },
      { notify: true }
    );
    expect(listener).not.toHaveBeenCalled();

    seedPostAuthorProfile(
      { accountId: 'seed-one.testnet', displayName: 'Oneder', avatarUrl: null },
      { notify: true }
    );
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    seedPostAuthorProfile(
      {
        accountId: 'seed-one.testnet',
        displayName: 'Onederful',
        avatarUrl: null,
      },
      { notify: true }
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('seeds feed authors and quoted ref authors with notify threading', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePostAuthorProfiles(listener);

    seedPostAuthorProfilesFromFeed(
      [
        {
          accountId: 'seed-two.testnet',
          authorName: 'Two',
          refAuthor: 'seed-three.testnet',
          refAuthorName: 'Three',
        },
      ],
      { notify: true }
    );
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
