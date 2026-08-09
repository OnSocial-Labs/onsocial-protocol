import { describe, expect, it } from 'vitest';
import {
  addMute,
  hasMute,
  listMutes,
  removeMute,
} from '../../src/services/mutes/index.js';

describe('mute service (memory store)', () => {
  it('adds, lists, and removes mutes for an owner', async () => {
    const owner = `alice-${Date.now()}.near`;
    const muted = 'bob.near';

    expect(await listMutes(owner)).toEqual([]);
    const added = await addMute(owner, muted);
    expect('code' in added).toBe(false);
    if ('code' in added) return;

    expect(added.mutedAccountId).toBe(muted);
    expect(await hasMute(owner, muted)).toBe(true);
    expect((await listMutes(owner)).map((m) => m.mutedAccountId)).toEqual([
      muted,
    ]);

    expect(await removeMute(owner, muted)).toBe(true);
    expect(await hasMute(owner, muted)).toBe(false);
  });

  it('rejects self-mute', async () => {
    const result = await addMute('alice.near', 'alice.near');
    expect(result).toMatchObject({ code: 'SELF_MUTE' });
  });
});
