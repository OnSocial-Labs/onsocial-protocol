import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  SPUTNIK_DAO_FACTORY,
  SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT,
  SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT_NEAR,
  SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR,
} from '@/lib/app-config';
import {
  extractNearTransactionHashes,
  nearToYocto,
  viewAccount,
} from '@/lib/app-near-rpc';
import { isValidNearAccountId } from '@/lib/app-near-account';
import { encodeDaoConfigMetadata } from '@/features/protocol/dao-branding';
import { daysToProposalPeriodNs } from '@/features/protocol/protocol-policy';

/** Gas for factory `create` (300 TGas). */
export const DAO_FACTORY_CREATE_GAS = '300000000000000';

/** Minimum slug length (NEAR account segment + UX). */
export const DAO_FACTORY_SLUG_MIN = 2;

/** Display name max (Sputnik config.name). */
export const DAO_FACTORY_NAME_MAX = 64;

/** Purpose max (Sputnik config.purpose). */
export const DAO_FACTORY_PURPOSE_MAX = 240;

/** Simple majority — matches Settings / gov style (same math as factory 1/2). */
export const DAO_FACTORY_VOTE_THRESHOLD: [number, number] = [50, 100];

/** Factory-default council permissions (not full `*:*`). */
export const DAO_FACTORY_COUNCIL_PERMISSIONS = [
  '*:AddProposal',
  '*:VoteApprove',
  '*:VoteReject',
  '*:VoteRemove',
  '*:Finalize',
] as const;

export type DaoFactoryPolicyRole = {
  name: string;
  kind: 'Everyone' | { Group: string[] };
  permissions: string[];
  vote_policy: Record<string, never>;
};

export type DaoFactoryPolicy = {
  roles: DaoFactoryPolicyRole[];
  default_vote_policy: {
    weight_kind: 'RoleWeight';
    quorum: string;
    threshold: [number, number];
  };
  proposal_bond: string;
  proposal_period: string;
  bounty_bond: string;
  bounty_forgiveness_period: string;
};

export type DaoFactoryInitArgs = {
  config: {
    name: string;
    purpose: string;
    metadata: string;
  };
  /** Full policy — 50/100 vote + 0.1 Ⓝ bond (not bare council list). */
  policy: DaoFactoryPolicy;
};

/**
 * Normalize a user slug for `{slug}.{factory}`.
 * Dots are stripped so the name stays a single account segment.
 */
export function normalizeDaoFactorySlug(value: string): string {
  const factory = SPUTNIK_DAO_FACTORY;
  const maxSlug = Math.max(2, 64 - factory.length - 1);
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxSlug);
}

/** Full DAO account id for the active network factory. */
export function buildDaoFactoryAccountId(slug: string): string {
  const name = normalizeDaoFactorySlug(slug);
  if (!name) return '';
  return `${name}.${SPUTNIK_DAO_FACTORY}`;
}

export function isValidDaoFactorySlug(slug: string): boolean {
  const name = normalizeDaoFactorySlug(slug);
  if (name.length < DAO_FACTORY_SLUG_MIN) return false;
  return isValidNearAccountId(buildDaoFactoryAccountId(name));
}

/** UTF-8 → standard base64 for Sputnik `Base64VecU8` init args. */
export function encodeDaoFactoryInitArgs(init: DaoFactoryInitArgs): string {
  const json = JSON.stringify(init);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Factory-starter policy with OnSocial defaults:
 * everyone can propose · council votes · 50/100 · 0.1 Ⓝ bond · 7-day period.
 */
export function buildDaoFactoryPolicy(
  councilAccountId: string
): DaoFactoryPolicy {
  const council = councilAccountId.trim().toLowerCase();
  return {
    roles: [
      {
        name: 'all',
        kind: 'Everyone',
        permissions: ['*:AddProposal'],
        vote_policy: {},
      },
      {
        name: 'council',
        kind: { Group: [council] },
        permissions: [...DAO_FACTORY_COUNCIL_PERMISSIONS],
        vote_policy: {},
      },
    ],
    default_vote_policy: {
      weight_kind: 'RoleWeight',
      quorum: '0',
      threshold: [...DAO_FACTORY_VOTE_THRESHOLD],
    },
    proposal_bond: nearToYocto(SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR),
    proposal_period: daysToProposalPeriodNs('7'),
    bounty_bond: nearToYocto('1'),
    bounty_forgiveness_period: daysToProposalPeriodNs('1'),
  };
}

export function buildDaoFactoryInitArgs(opts: {
  displayName: string;
  purpose: string;
  councilAccountId: string;
  metadata?: string;
}): DaoFactoryInitArgs {
  const name = opts.displayName.trim().slice(0, DAO_FACTORY_NAME_MAX);
  const purpose = opts.purpose.trim().slice(0, DAO_FACTORY_PURPOSE_MAX);
  const council = opts.councilAccountId.trim().toLowerCase();
  return {
    config: {
      name: name || 'DAO',
      purpose,
      // Sputnik Config.metadata is Base64VecU8 — never plain JSON.
      metadata: encodeDaoConfigMetadata(opts.metadata),
    },
    policy: buildDaoFactoryPolicy(council),
  };
}

/** Short facts for the create sheet “You get” strip. */
export function daoFactoryCreatePolicyFacts(): {
  council: string;
  publicPropose: string;
  vote: string;
  bond: string;
  createDeposit: string;
} {
  return {
    council: 'You start as council',
    publicPropose: 'Anyone can propose',
    vote: '50% majority',
    bond: `${SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR} NEAR proposal bond`,
    createDeposit: `~${SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT_NEAR} NEAR to create`,
  };
}

/**
 * Probe whether `{slug}.{factory}` already exists on-chain.
 * Missing account → available; view success → taken.
 */
export async function probeDaoFactoryAccountTaken(
  daoAccountId: string
): Promise<boolean> {
  const id = daoAccountId.trim().toLowerCase();
  if (!id || !isValidNearAccountId(id)) return false;
  try {
    const view = await viewAccount(id);
    return view != null;
  } catch {
    return false;
  }
}

export async function submitDaoFactoryCreate(opts: {
  wallet: NearWalletBase;
  accountId: string;
  slug: string;
  displayName: string;
  purpose: string;
  metadata?: string;
}): Promise<{ daoAccountId: string; txHashes: string[] }> {
  const slug = normalizeDaoFactorySlug(opts.slug);
  if (!isValidDaoFactorySlug(slug)) {
    throw new Error('Choose a valid DAO account id.');
  }
  const council = opts.accountId.trim().toLowerCase();
  if (!isValidNearAccountId(council)) {
    throw new Error('Connect a valid NEAR account.');
  }
  const daoAccountId = buildDaoFactoryAccountId(slug);
  const init = buildDaoFactoryInitArgs({
    displayName: opts.displayName,
    purpose: opts.purpose,
    councilAccountId: council,
    metadata: opts.metadata,
  });

  const result = await opts.wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId: council,
    receiverId: SPUTNIK_DAO_FACTORY,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'create',
          args: {
            name: slug,
            args: encodeDaoFactoryInitArgs(init),
          },
          gas: DAO_FACTORY_CREATE_GAS,
          deposit: SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT,
        },
      },
    ],
  });

  return {
    daoAccountId,
    txHashes: extractNearTransactionHashes(result),
  };
}
