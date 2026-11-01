import { describe, expect, it } from 'vitest';
import {
  canCreateInApp,
  creatorAccessLabel,
  creatorAccessShort,
  type AppView,
} from '@/features/scarces/apps-data';

describe('hub creator access voice', () => {
  it('names the three doors as who can drop', () => {
    expect(creatorAccessShort('open')).toBe('Open');
    expect(creatorAccessShort('approval')).toBe('Approval');
    expect(creatorAccessShort('invite_only')).toBe('Invite');
  });

  it('explains each door in one line', () => {
    expect(creatorAccessLabel('open')).toBe('Anyone can drop');
    expect(creatorAccessLabel('approval')).toBe(
      'Creators publish after approval'
    );
    expect(creatorAccessLabel('invite_only')).toBe(
      'The house chooses who can publish'
    );
  });

  it('lets a house-added creator publish and keeps everyone else out', () => {
    const house = {
      appId: 'house',
      ownerId: 'owner.testnet',
      title: 'House',
      mediaUrl: null,
      bannerUrl: null,
      categories: [],
      category: null,
      primarySaleBps: 0,
      commissionPct: '0',
      creatorAccess: 'invite_only',
      moderators: ['mod.testnet'],
      approvedCreators: ['creator.testnet'],
      metadataRaw: null,
    } satisfies AppView;
    expect(canCreateInApp(house, 'creator.testnet')).toBe(true);
    expect(canCreateInApp(house, 'mod.testnet')).toBe(true);
    expect(canCreateInApp(house, 'visitor.testnet')).toBe(false);
  });
});
