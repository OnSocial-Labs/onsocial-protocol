import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  SPUTNIK_DAO_FACTORY,
  SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT,
} from '@/lib/app-config';
import { extractNearTransactionHashes, viewAccount } from '@/lib/app-near-rpc';
import { isValidNearAccountId } from '@/lib/app-near-account';

/** Gas for factory `create` (300 TGas). */
export const DAO_FACTORY_CREATE_GAS = '300000000000000';

/** Minimum slug length (NEAR account segment + UX). */
export const DAO_FACTORY_SLUG_MIN = 2;

/** Display name max (Sputnik config.name). */
export const DAO_FACTORY_NAME_MAX = 64;

/** Purpose max (Sputnik config.purpose). */
export const DAO_FACTORY_PURPOSE_MAX = 240;

export type DaoFactoryInitArgs = {
  config: {
    name: string;
    purpose: string;
    metadata: string;
  };
  /** Simple council list — factory expands to default policy. */
  policy: string[];
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

export function buildDaoFactoryInitArgs(opts: {
  displayName: string;
  purpose: string;
  councilAccountId: string;
}): DaoFactoryInitArgs {
  const name = opts.displayName.trim().slice(0, DAO_FACTORY_NAME_MAX);
  const purpose = opts.purpose.trim().slice(0, DAO_FACTORY_PURPOSE_MAX);
  const council = opts.councilAccountId.trim().toLowerCase();
  return {
    config: {
      name: name || 'DAO',
      purpose,
      metadata: '',
    },
    policy: [council],
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
