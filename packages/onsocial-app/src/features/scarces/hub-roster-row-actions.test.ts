import { describe, expect, it } from 'vitest';
import {
  hubRosterRowActions,
  type HubRosterManageContext,
} from '@/features/scarces/hub-roster-row-actions';
import type { HubRosterRow } from '@/features/scarces/hub-roster';

function row(
  overrides: Partial<HubRosterRow> & Pick<HubRosterRow, 'accountId' | 'role'>
): HubRosterRow {
  return {
    roleLabel: 'Moderator',
    addedAtNs: null,
    ...overrides,
  };
}

const ownerManager: HubRosterManageContext = {
  viewerAccountId: 'owner.testnet',
  canManageModerators: true,
  canManageCreators: true,
};

describe('hub roster row actions', () => {
  it('hides menu for owner rows and self', () => {
    expect(
      hubRosterRowActions(
        row({ accountId: 'owner.testnet', role: 'owner', roleLabel: 'Owner' }),
        ownerManager
      )
    ).toEqual([]);
    expect(
      hubRosterRowActions(
        row({ accountId: 'owner.testnet', role: 'moderator' }),
        ownerManager
      )
    ).toEqual([]);
  });

  it('offers remove moderator for owners viewing mods', () => {
    const actions = hubRosterRowActions(
      row({ accountId: 'mod.testnet', role: 'moderator' }),
      ownerManager
    );
    expect(actions.map((action) => action.id)).toEqual([
      'remove-moderator',
      'copy-handle',
    ]);
  });

  it('lets moderators remove creators when allowed', () => {
    const actions = hubRosterRowActions(
      row({ accountId: 'artist.testnet', role: 'approved_creator' }),
      {
        viewerAccountId: 'mod.testnet',
        canManageModerators: false,
        canManageCreators: true,
      }
    );
    expect(actions.map((action) => action.id)).toEqual([
      'remove-creator',
      'copy-handle',
    ]);
  });
});
