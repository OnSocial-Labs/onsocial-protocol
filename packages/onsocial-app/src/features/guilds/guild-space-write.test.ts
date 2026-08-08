import { describe, expect, it } from 'vitest';
import { PERMISSION, type PermissionEventRow } from '@onsocial/sdk';
import { foldSpaceWriteGrantees } from '@/features/guilds/guild-space-write';

function event(
  partial: Partial<PermissionEventRow> &
    Pick<PermissionEventRow, 'operation' | 'targetId' | 'level'>
): PermissionEventRow {
  return {
    author: 'dao',
    path: 'groups/dao/spaces/room/write',
    deleted: false,
    blockHeight: 1,
    blockTimestamp: 1,
    ...partial,
  };
}

describe('foldSpaceWriteGrantees', () => {
  it('keeps latest grant per target and drops revokes', () => {
    const granted = foldSpaceWriteGrantees([
      event({
        operation: 'revoke',
        targetId: 'bob.near',
        level: PERMISSION.NONE,
        blockHeight: 3,
      }),
      event({
        operation: 'grant',
        targetId: 'alice.near',
        level: PERMISSION.WRITE,
        blockHeight: 2,
      }),
      event({
        operation: 'grant',
        targetId: 'bob.near',
        level: PERMISSION.WRITE,
        blockHeight: 1,
      }),
    ]);

    expect([...granted].sort()).toEqual(['alice.near']);
  });

  it('ignores key-scoped ops for account writer lists', () => {
    const granted = foldSpaceWriteGrantees([
      event({
        operation: 'grant_key',
        targetId: 'alice.near',
        level: PERMISSION.WRITE,
      }),
    ]);
    expect(granted.size).toBe(0);
  });
});
