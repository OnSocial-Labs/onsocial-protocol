import { describe, expect, it, vi } from 'vitest';
import { EndorsementsModule } from './endorsements.js';
import type { SocialModule } from './social.js';
import type { QueryModule } from './query.js';

function makeMod(opts: { existingEndorsement?: unknown } = {}) {
  const endorse = vi.fn().mockResolvedValue({ txHash: 'set' });
  const unendorse = vi.fn().mockResolvedValue({ txHash: 'unset' });
  const getEndorsement = vi
    .fn()
    .mockResolvedValue(opts.existingEndorsement ?? null);
  const social = {
    endorse,
    unendorse,
    getEndorsement,
  } as unknown as SocialModule;

  const getEndorsementsGiven = vi.fn().mockResolvedValue([
    {
      issuer: 'alice.near',
      target: 'bob.near',
      value: JSON.stringify({ v: 1, since: 1000, weight: 4, topic: 'rust' }),
      blockHeight: 100,
      blockTimestamp: 1700000000,
      operation: 'set',
    },
  ]);
  const getEndorsementsReceived = vi.fn().mockResolvedValue([
    {
      issuer: 'alice.near',
      target: 'bob.near',
      value: JSON.stringify({ v: 1, since: 2000, weight: 5 }),
      blockHeight: 101,
      blockTimestamp: 1700000100,
      operation: 'set',
    },
  ]);
  const query = {
    getEndorsementsGiven,
    getEndorsementsReceived,
  } as unknown as QueryModule;

  return {
    mod: new EndorsementsModule(social, query),
    spies: {
      endorse,
      unendorse,
      getEndorsement,
      getEndorsementsGiven,
      getEndorsementsReceived,
    },
  };
}

describe('EndorsementsModule', () => {
  it('add forwards to social.endorse', async () => {
    const { mod, spies } = makeMod();
    await mod.add('bob.near', { topic: 'rust', weight: 5 });
    expect(spies.endorse).toHaveBeenCalledWith('bob.near', {
      topic: 'rust',
      weight: 5,
    });
  });

  it('remove forwards topic to social.unendorse', async () => {
    const { mod, spies } = makeMod();
    await mod.remove('bob.near', { topic: 'rust' });
    expect(spies.unendorse).toHaveBeenCalledWith('bob.near', 'rust');
  });

  it('toggle endorses when none exists', async () => {
    const { mod, spies } = makeMod({ existingEndorsement: null });
    const out = await mod.toggle('bob.near', { topic: 'rust' });
    expect(out.applied).toBe(true);
    expect(spies.endorse).toHaveBeenCalled();
    expect(spies.unendorse).not.toHaveBeenCalled();
  });

  it('toggle removes when one exists', async () => {
    const { mod, spies } = makeMod({
      existingEndorsement: { target: 'bob.near', v: 1, since: 1 },
    });
    const out = await mod.toggle('bob.near', { topic: 'rust' });
    expect(out.applied).toBe(false);
    expect(spies.unendorse).toHaveBeenCalledWith('bob.near', 'rust');
    expect(spies.endorse).not.toHaveBeenCalled();
  });

  it('get passes topic and issuer through', async () => {
    const { mod, spies } = makeMod();
    await mod.get('bob.near', { issuer: 'alice.near', topic: 'rust' });
    expect(spies.getEndorsement).toHaveBeenCalledWith('bob.near', {
      topic: 'rust',
      accountId: 'alice.near',
    });
  });

  it('listGiven materialises rows with parsed value', async () => {
    const { mod } = makeMod();
    const out = await mod.listGiven('alice.near', { limit: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      issuer: 'alice.near',
      target: 'bob.near',
      weight: 4,
      topic: 'rust',
      blockHeight: 100,
      blockTimestamp: 1700000000,
    });
  });

  it('listReceived materialises rows with parsed value', async () => {
    const { mod } = makeMod();
    const out = await mod.listReceived('bob.near');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      issuer: 'alice.near',
      target: 'bob.near',
      weight: 5,
      blockHeight: 101,
    });
  });

  it('listGiven survives unparseable values', async () => {
    const { mod, spies } = makeMod();
    spies.getEndorsementsGiven.mockResolvedValueOnce([
      {
        issuer: 'a.near',
        target: 'b.near',
        value: 'not json',
        blockHeight: 1,
        blockTimestamp: 1,
        operation: 'set',
      },
    ]);
    const out = await mod.listGiven('a.near');
    expect(out[0].issuer).toBe('a.near');
    expect(out[0].target).toBe('b.near');
    expect(out[0].v).toBe(1);
  });
});
