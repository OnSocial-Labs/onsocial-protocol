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
  const out = vi.fn().mockResolvedValue(outgoing);
  const inc = vi.fn().mockResolvedValue(['carol.near']);
  const counts = vi.fn().mockResolvedValue({ incoming: 1, outgoing: 2 });
  return {
    spies: { out, inc, counts },
    mod: {
      standings: { outgoing: out, incoming: inc, counts },
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
  it('returns true when target is in viewer outgoing list', async () => {
    const { mod } = makeSocial();
    const s = new StandingsModule(mod, makeQuery(['bob.near']).mod);
    expect(await s.has('alice.near', 'bob.near')).toBe(true);
  });

  it('returns false when target is not in viewer outgoing list', async () => {
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

  it('counts forwards to query.standings.counts', async () => {
    const query = makeQuery();
    const s = new StandingsModule(makeSocial().mod, query.mod);
    const c = await s.counts('alice.near');
    expect(query.spies.counts).toHaveBeenCalledWith('alice.near');
    expect(c).toEqual({ incoming: 1, outgoing: 2 });
  });
});
