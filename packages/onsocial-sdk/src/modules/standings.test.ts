import { describe, expect, it, vi } from 'vitest';
import { StandingsModule } from './standings.js';
import type { SocialModule } from './social.js';
import type { QueryModule } from '../query/index.js';

function makeSocial(opts: { existing?: string[] } = {}) {
  const standWith = vi.fn().mockResolvedValue({ txHash: 'tx-add' });
  const unstand = vi.fn().mockResolvedValue({ txHash: 'tx-remove' });
  return {
    spies: { standWith, unstand },
    mod: { standWith, unstand } as unknown as SocialModule,
    existing: opts.existing ?? [],
  };
}

function makeQuery(outgoing: string[] = []) {
  const viewerStandsWith = vi.fn(
    async (_viewer: string, target: string) => outgoing.includes(target)
  );
  const out = vi.fn().mockResolvedValue(outgoing);
  const outDetailed = vi.fn().mockResolvedValue([
    {
      accountId: 'alice.near',
      targetAccount: 'bob.near',
      since: 1,
      blockHeight: 10,
      blockTimestamp: 100,
    },
  ]);
  const inc = vi.fn().mockResolvedValue(['carol.near']);
  const incDetailed = vi.fn().mockResolvedValue([
    {
      accountId: 'carol.near',
      targetAccount: 'alice.near',
      since: 2,
      blockHeight: 11,
      blockTimestamp: 110,
    },
  ]);
  const counts = vi.fn().mockResolvedValue({ incoming: 1, outgoing: 2 });
  const mutualDetailed = vi.fn().mockResolvedValue([]);
  return {
    spies: {
      viewerStandsWith,
      out,
      outDetailed,
      inc,
      incDetailed,
      counts,
      mutualDetailed,
    },
    mod: {
      standings: {
        viewerStandsWith,
        outgoing: out,
        outgoingDetailed: outDetailed,
        incoming: inc,
        incomingDetailed: incDetailed,
        counts,
        mutualDetailed,
      },
    } as unknown as QueryModule,
  };
}

describe('StandingsModule.add / remove', () => {
  it('add forwards to social.standWith', async () => {
    const { mod, spies } = makeSocial();
    const s = new StandingsModule(mod, makeQuery().mod);
    const res = await s.add('bob.near');
    expect(spies.standWith).toHaveBeenCalledWith('bob.near');
    expect(res).toEqual({ txHash: 'tx-add' });
  });

  it('remove forwards to social.unstand', async () => {
    const { mod, spies } = makeSocial();
    const s = new StandingsModule(mod, makeQuery().mod);
    const res = await s.remove('bob.near');
    expect(spies.unstand).toHaveBeenCalledWith('bob.near');
    expect(res).toEqual({ txHash: 'tx-remove' });
  });
});

describe('StandingsModule.has', () => {
  it('returns true when viewer stands with target', async () => {
    const { mod } = makeSocial();
    const q = makeQuery(['bob.near']);
    const s = new StandingsModule(mod, q.mod);
    expect(await s.has('alice.near', 'bob.near')).toBe(true);
    expect(q.spies.viewerStandsWith).toHaveBeenCalledWith(
      'alice.near',
      'bob.near'
    );
  });

  it('returns false when viewer does not stand with target', async () => {
    const { mod } = makeSocial();
    const s = new StandingsModule(mod, makeQuery(['carol.near']).mod);
    expect(await s.has('alice.near', 'bob.near')).toBe(false);
  });
});

describe('StandingsModule.toggle', () => {
  it('removes when edge exists, returns applied=false', async () => {
    const social = makeSocial();
    const query = makeQuery(['bob.near']);
    const s = new StandingsModule(social.mod, query.mod);
    const { applied } = await s.toggle('bob.near', { viewer: 'alice.near' });
    expect(applied).toBe(false);
    expect(social.spies.unstand).toHaveBeenCalledWith('bob.near');
    expect(social.spies.standWith).not.toHaveBeenCalled();
  });

  it('adds when edge missing, returns applied=true', async () => {
    const social = makeSocial();
    const query = makeQuery([]);
    const s = new StandingsModule(social.mod, query.mod);
    const { applied } = await s.toggle('bob.near', { viewer: 'alice.near' });
    expect(applied).toBe(true);
    expect(social.spies.standWith).toHaveBeenCalledWith('bob.near');
    expect(social.spies.unstand).not.toHaveBeenCalled();
  });
});

describe('StandingsModule list / counts', () => {
  it('listOutgoing forwards to query.standings.outgoing', async () => {
    const query = makeQuery(['bob.near']);
    const s = new StandingsModule(makeSocial().mod, query.mod);
    const out = await s.listOutgoing('alice.near', { limit: 10 });
    expect(query.spies.out).toHaveBeenCalledWith('alice.near', { limit: 10 });
    expect(out).toEqual(['bob.near']);
  });

  it('listIncoming forwards to query.standings.incoming', async () => {
    const query = makeQuery();
    const s = new StandingsModule(makeSocial().mod, query.mod);
    const inc = await s.listIncoming('alice.near');
    expect(query.spies.inc).toHaveBeenCalledWith('alice.near', {});
    expect(inc).toEqual(['carol.near']);
  });

  it('listOutgoingDetailed forwards to query.standings.outgoingDetailed', async () => {
    const query = makeQuery();
    const s = new StandingsModule(makeSocial().mod, query.mod);
    const out = await s.listOutgoingDetailed('alice.near', { limit: 10 });
    expect(query.spies.outDetailed).toHaveBeenCalledWith('alice.near', {
      limit: 10,
    });
    expect(out[0]?.targetAccount).toBe('bob.near');
  });

  it('listIncomingDetailed forwards to query.standings.incomingDetailed', async () => {
    const query = makeQuery();
    const s = new StandingsModule(makeSocial().mod, query.mod);
    const inc = await s.listIncomingDetailed('alice.near');
    expect(query.spies.incDetailed).toHaveBeenCalledWith('alice.near', {});
    expect(inc[0]?.accountId).toBe('carol.near');
  });

  it('counts forwards to query.standings.counts', async () => {
    const query = makeQuery();
    const s = new StandingsModule(makeSocial().mod, query.mod);
    const c = await s.counts('alice.near');
    expect(query.spies.counts).toHaveBeenCalledWith('alice.near');
    expect(c).toEqual({ incoming: 1, outgoing: 2 });
  });

  it('mutualList forwards to query.standings.mutualDetailed', async () => {
    const query = makeQuery();
    const s = new StandingsModule(makeSocial().mod, query.mod);
    await s.mutualList('alice.near', { limit: 24, offset: 0 });
    expect(query.spies.mutualDetailed).toHaveBeenCalledWith('alice.near', {
      limit: 24,
      offset: 0,
    });
  });
});
