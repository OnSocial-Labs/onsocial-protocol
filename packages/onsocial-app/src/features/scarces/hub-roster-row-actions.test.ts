import { describe, expect, it } from 'vitest';
import {
  buildHubRosterManageContext,
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
  showCreatorRoster: true,
};

describe('hub roster row actions', () => {
  it('builds manage context for hub owners', () => {
    expect(
      buildHubRosterManageContext('owner.testnet', true, true, true)
    ).toEqual({
      viewerAccountId: 'owner.testnet',
      canManageModerators: true,
      canManageCreators: true,
      showCreatorRoster: true,
    });
    expect(buildHubRosterManageContext(null, true, true, true)).toBeNull();
  });

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

  it('offers transfer and mod actions for owners viewing mods', () => {
    const actions = hubRosterRowActions(
      row({ accountId: 'mod.testnet', role: 'moderator' }),
      ownerManager
    );
    expect(actions.map((action) => action.id)).toEqual([
      'transfer-ownership',
      'make-creator',
      'remove-moderator',
      'copy-handle',
    ]);
  });

  it('offers make moderator on creator rows for owners', () => {
    const actions = hubRosterRowActions(
      row({ accountId: 'artist.testnet', role: 'approved_creator' }),
      ownerManager
    );
    expect(actions.map((action) => action.id)).toEqual([
      'transfer-ownership',
      'make-moderator',
      'remove-creator',
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
        showCreatorRoster: true,
      }
    );
    expect(actions.map((action) => action.id)).toEqual([
      'remove-creator',
      'copy-handle',
    ]);
  });
});
