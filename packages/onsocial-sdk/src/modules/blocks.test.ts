import { describe, expect, it, vi } from 'vitest';
import { BlocksModule } from './blocks.js';
import type { SocialModule } from './social.js';
import type { QueryModule } from '../query/index.js';

function makeSocial() {
  const blockAccount = vi.fn().mockResolvedValue({ txHash: 'tx-block' });
  const unblockAccount = vi.fn().mockResolvedValue({ txHash: 'tx-unblock' });
  return {
    spies: { blockAccount, unblockAccount },
    mod: { blockAccount, unblockAccount } as unknown as SocialModule,
  };
}

function makeQuery(outgoing: string[] = []) {
  const viewerBlocks = vi.fn(async (_viewer: string, target: string) =>
    outgoing.includes(target)
  );
  const eitherWay = vi.fn(async () => false);
  const out = vi.fn().mockResolvedValue(outgoing);
  const outDetailed = vi.fn().mockResolvedValue([]);
  const inc = vi.fn().mockResolvedValue([]);
  const incDetailed = vi.fn().mockResolvedValue([]);
  return {
    spies: { viewerBlocks, eitherWay, out },
    mod: {
      blocks: {
        viewerBlocks,
        eitherWay,
        outgoing: out,
        outgoingDetailed: outDetailed,
        incoming: inc,
        incomingDetailed: incDetailed,
      },
    } as unknown as QueryModule,
  };
}

describe('BlocksModule', () => {
  it('add forwards to social.blockAccount', async () => {
    const { mod, spies } = makeSocial();
    const b = new BlocksModule(mod, makeQuery().mod);
    const res = await b.add('bob.near');
    expect(spies.blockAccount).toHaveBeenCalledWith('bob.near');
    expect(res).toEqual({ txHash: 'tx-block' });
  });

  it('remove forwards to social.unblockAccount', async () => {
    const { mod, spies } = makeSocial();
    const b = new BlocksModule(mod, makeQuery().mod);
    const res = await b.remove('bob.near');
    expect(spies.unblockAccount).toHaveBeenCalledWith('bob.near');
    expect(res).toEqual({ txHash: 'tx-unblock' });
  });

  it('toggle adds when missing and removes when present', async () => {
    const { mod, spies } = makeSocial();
    const empty = makeQuery([]);
    const present = makeQuery(['bob.near']);
    const addMod = new BlocksModule(mod, empty.mod);
    const remMod = new BlocksModule(mod, present.mod);

    const added = await addMod.toggle('bob.near', { viewer: 'alice.near' });
    expect(added.applied).toBe(true);
    expect(spies.blockAccount).toHaveBeenCalled();

    const removed = await remMod.toggle('bob.near', { viewer: 'alice.near' });
    expect(removed.applied).toBe(false);
    expect(spies.unblockAccount).toHaveBeenCalled();
  });
});
