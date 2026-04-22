import { describe, expect, it, vi } from 'vitest';
import { AttestationsModule } from './attestations.js';
import type { SocialModule } from './social.js';
import type { QueryModule } from './query.js';

function makeMod() {
  const attest = vi.fn().mockResolvedValue({ txHash: 'set' });
  const revokeAttestation = vi.fn().mockResolvedValue({ txHash: 'unset' });
  const getAttestation = vi.fn().mockResolvedValue(null);
  const social = {
    attest,
    revokeAttestation,
    getAttestation,
  } as unknown as SocialModule;

  const getClaimsIssued = vi.fn().mockResolvedValue([
    {
      issuer: 'alice.near',
      subject: 'bob.near',
      claimType: 'skill',
      claimId: 'rust-2026',
      value: JSON.stringify({
        v: 1,
        type: 'skill',
        subject: 'bob.near',
        issuedAt: 1700,
        scope: 'rust',
      }),
      blockHeight: 200,
      blockTimestamp: 1700000200,
      operation: 'set',
    },
  ]);
  const getClaimsAbout = vi.fn().mockResolvedValue([
    {
      issuer: 'alice.near',
      subject: 'bob.near',
      claimType: 'skill',
      claimId: 'rust-2026',
      value: JSON.stringify({
        v: 1,
        type: 'skill',
        subject: 'bob.near',
        issuedAt: 1700,
      }),
      blockHeight: 200,
      blockTimestamp: 1700000200,
      operation: 'set',
    },
  ]);
  const query = {
    getClaimsIssued,
    getClaimsAbout,
  } as unknown as QueryModule;

  return {
    mod: new AttestationsModule(social, query),
    spies: {
      attest,
      revokeAttestation,
      getAttestation,
      getClaimsIssued,
      getClaimsAbout,
    },
  };
}

describe('AttestationsModule', () => {
  it('issue auto-generates a claimId when none provided', async () => {
    const { mod, spies } = makeMod();
    const out = await mod.issue({
      type: 'skill',
      subject: 'bob.near',
      scope: 'rust',
    });
    expect(out.claimId).toBeTruthy();
    expect(spies.attest).toHaveBeenCalledWith(out.claimId, {
      type: 'skill',
      subject: 'bob.near',
      scope: 'rust',
    });
  });

  it('issue uses caller-provided claimId for idempotency', async () => {
    const { mod, spies } = makeMod();
    const out = await mod.issue(
      { type: 'skill', subject: 'bob.near' },
      { claimId: 'rust-2026' }
    );
    expect(out.claimId).toBe('rust-2026');
    expect(spies.attest).toHaveBeenCalledWith('rust-2026', {
      type: 'skill',
      subject: 'bob.near',
    });
  });

  it('revoke forwards to social.revokeAttestation', async () => {
    const { mod, spies } = makeMod();
    await mod.revoke('bob.near', 'skill', 'rust-2026');
    expect(spies.revokeAttestation).toHaveBeenCalledWith(
      'bob.near',
      'skill',
      'rust-2026'
    );
  });

  it('get forwards issuer override', async () => {
    const { mod, spies } = makeMod();
    await mod.get('bob.near', 'skill', 'rust-2026', {
      issuer: 'alice.near',
    });
    expect(spies.getAttestation).toHaveBeenCalledWith(
      'bob.near',
      'skill',
      'rust-2026',
      'alice.near'
    );
  });

  it('listIssued passes type filter through', async () => {
    const { mod, spies } = makeMod();
    await mod.listIssued('alice.near', { type: 'skill', limit: 5 });
    expect(spies.getClaimsIssued).toHaveBeenCalledWith('alice.near', {
      claimType: 'skill',
      limit: 5,
    });
  });

  it('listIssued materialises rows with parsed value', async () => {
    const { mod } = makeMod();
    const out = await mod.listIssued('alice.near');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      issuer: 'alice.near',
      subject: 'bob.near',
      type: 'skill',
      claimId: 'rust-2026',
      scope: 'rust',
      blockHeight: 200,
    });
  });

  it('listAbout materialises rows with parsed value', async () => {
    const { mod } = makeMod();
    const out = await mod.listAbout('bob.near');
    expect(out[0].subject).toBe('bob.near');
    expect(out[0].issuer).toBe('alice.near');
    expect(out[0].issuedAt).toBe(1700);
  });

  it('listAbout survives unparseable values', async () => {
    const { mod, spies } = makeMod();
    spies.getClaimsAbout.mockResolvedValueOnce([
      {
        issuer: 'i.near',
        subject: 's.near',
        claimType: 't',
        claimId: 'c',
        value: 'broken',
        blockHeight: 1,
        blockTimestamp: 1,
        operation: 'set',
      },
    ]);
    const out = await mod.listAbout('s.near');
    expect(out[0].claimId).toBe('c');
    expect(out[0].v).toBe(1);
  });
});
