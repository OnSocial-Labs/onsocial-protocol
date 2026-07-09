import { describe, expect, it } from 'vitest';
import type { Proposal } from '@onsocial/sdk';
import { PERMISSION } from '@onsocial/sdk';
import {
  listActivePermissionChangeProposals,
  pendingGuildMemberRoleLabel,
} from '@/features/guilds/guild-member-pending-roles';

describe('guild member pending roles', () => {
  it('collects active permission_change proposals by target', () => {
    const proposals = [
      {
        id: 'p1',
        type: 'permission_change',
        status: 'active',
        target: 'mod.testnet',
        data: { PermissionChange: { target_user: 'mod.testnet', level: 2 } },
      },
      {
        id: 'p2',
        type: 'permission_change',
        status: 'executed',
        target: 'old.testnet',
        data: { PermissionChange: { target_user: 'old.testnet', level: 2 } },
      },
    ] as unknown as Proposal[];

    expect(listActivePermissionChangeProposals(proposals)).toEqual(
      new Map([
        ['mod.testnet', { level: PERMISSION.MODERATE, proposalId: 'p1' }],
      ])
    );
  });

  it('labels pending role badges', () => {
    expect(pendingGuildMemberRoleLabel(PERMISSION.MODERATE)).toBe(
      'Mod vote pending'
    );
    expect(pendingGuildMemberRoleLabel(PERMISSION.MANAGE)).toBe(
      'Admin vote pending'
    );
  });
});
