import { describe, expect, it } from 'vitest';
import {
  ACTIVE_NEAR_NETWORK,
  SPUTNIK_DAO_FACTORY,
  SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR,
} from '@/lib/app-config';
import { nearToYocto } from '@/lib/app-near-rpc';
import {
  buildDaoFactoryAccountId,
  buildDaoFactoryInitArgs,
  buildDaoFactoryPolicy,
  DAO_FACTORY_VOTE_THRESHOLD,
  encodeDaoFactoryInitArgs,
  isValidDaoFactorySlug,
  normalizeDaoFactorySlug,
} from '@/features/protocol/dao-factory-create';
import { buildDaoSocialProfileProposalPayload } from '@/features/protocol/dao-social-profile';
import { CORE_CONTRACT } from '@/lib/app-near-contract';

describe('dao-factory-create', () => {
  it('normalizes slugs to a single account segment', () => {
    expect(normalizeDaoFactorySlug('  Cool Guild!  ')).toBe('cool-guild');
    expect(normalizeDaoFactorySlug('a.b.c')).toBe('a-b-c');
    expect(normalizeDaoFactorySlug('---x---')).toBe('x');
  });

  it('builds factory child account ids for the active network', () => {
    expect(buildDaoFactoryAccountId('primitives')).toBe(
      `primitives.${SPUTNIK_DAO_FACTORY}`
    );
    expect(SPUTNIK_DAO_FACTORY).toBe(
      ACTIVE_NEAR_NETWORK === 'mainnet'
        ? 'sputnik-dao.near'
        : 'sputnikv2.testnet'
    );
  });

  it('rejects short or invalid slugs', () => {
    expect(isValidDaoFactorySlug('')).toBe(false);
    expect(isValidDaoFactorySlug('a')).toBe(false);
    expect(isValidDaoFactorySlug('ok')).toBe(true);
  });

  it('builds full policy with 50/100 vote and 0.1 NEAR bond', () => {
    const policy = buildDaoFactoryPolicy('alice.testnet');
    expect(policy.roles[0]).toMatchObject({
      name: 'all',
      kind: 'Everyone',
      permissions: ['*:AddProposal'],
    });
    expect(policy.roles[1]).toMatchObject({
      name: 'council',
      kind: { Group: ['alice.testnet'] },
    });
    expect(policy.default_vote_policy.threshold).toEqual(
      DAO_FACTORY_VOTE_THRESHOLD
    );
    expect(policy.proposal_bond).toBe(
      nearToYocto(SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR)
    );
  });

  it('encodes init args as base64 JSON for factory create', () => {
    const metadataPlain = JSON.stringify({
      onsocial: { v: 1, name: 'Primitives', avatar: 'ipfs://crest' },
    });
    const init = buildDaoFactoryInitArgs({
      displayName: 'Primitives',
      purpose: 'Building on NEAR',
      councilAccountId: 'alice.testnet',
      metadata: metadataPlain,
    });
    expect(init.config.name).toBe('Primitives');
    expect(init.config.purpose).toBe('Building on NEAR');
    // Config.metadata must be Base64VecU8, not plain JSON.
    expect(init.config.metadata).toBe(
      Buffer.from(metadataPlain, 'utf8').toString('base64')
    );
    expect(init.policy.roles).toHaveLength(2);

    const encoded = encodeDaoFactoryInitArgs(init);
    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64').toString('utf8')
    ) as typeof init;
    expect(decoded).toEqual(init);
  });
});

describe('dao-social-profile', () => {
  it('builds a Call proposal to core execute with profile set', () => {
    const payload = buildDaoSocialProfileProposalPayload({
      name: 'Builder Guild',
      bio: 'We build',
      avatar: 'ipfs://crest',
      banner: 'ipfs://cover',
      links: { website: 'https://example.com', x: 'builders' },
    });
    const kind = payload.proposal.kind as {
      FunctionCall: {
        receiver_id: string;
        actions: Array<{
          method_name: string;
          args: string;
          deposit: string;
        }>;
      };
    };
    expect(kind.FunctionCall.receiver_id).toBe(CORE_CONTRACT);
    expect(kind.FunctionCall.actions[0]?.method_name).toBe('execute');
    const args = JSON.parse(
      Buffer.from(kind.FunctionCall.actions[0]!.args, 'base64').toString('utf8')
    ) as {
      request: { action: { type: string; data: Record<string, string> } };
    };
    expect(args.request.action.type).toBe('set');
    expect(args.request.action.data['profile/name']).toBe('Builder Guild');
    expect(args.request.action.data['profile/kind']).toBe('dao');
    expect(args.request.action.data['profile/avatar']).toBe('ipfs://crest');
    expect(args.request.action.data['profile/links']).toContain('website');
  });
});
