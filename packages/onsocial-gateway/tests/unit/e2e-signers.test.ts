import { afterEach, describe, expect, it } from 'vitest';
import {
  base58Encode,
  decodeNearKeypair,
  ed25519PublicFromSeed,
  hasE2eSigner,
  resolveE2eSignerAccount,
} from '../../../../scripts/e2e-signers.mjs';

const SIGNER_ENV = [
  'E2E_SIGNER_ACCOUNT',
  'E2E_SIGNER_PRIVATE_KEY',
  'E2E_COUNTERPARTY_ACCOUNT',
  'E2E_COUNTERPARTY_PRIVATE_KEY',
  'TICKET_E2E_ORGANIZER_ACCOUNT',
  'TICKET_E2E_ORGANIZER_PRIVATE_KEY',
  'TICKET_E2E_BUYER_ACCOUNT',
  'TICKET_E2E_BUYER_PRIVATE_KEY',
  'ACCOUNT_ID',
  'TEST_ACCOUNT_ID',
  'TEST_PRIVATE_KEY',
  'SECONDARY_ACCOUNT_ID',
] as const;

const snapshot: Record<string, string | undefined> = {};

afterEach(() => {
  for (const name of SIGNER_ENV) {
    if (name in snapshot) {
      const value = snapshot[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
      delete snapshot[name];
    }
  }
});

function setEnv(name: (typeof SIGNER_ENV)[number], value: string | undefined) {
  if (!(name in snapshot)) snapshot[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('e2e signers', () => {
  it('derives the RFC 8032 ed25519 public key from a 32-byte seed', () => {
    const seed = Buffer.from(
      '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
      'hex'
    );
    expect(ed25519PublicFromSeed(seed).toString('hex')).toBe(
      'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'
    );
  });

  it('prefers generic aliases over TICKET_E2E_* names', () => {
    setEnv('E2E_SIGNER_ACCOUNT', 'creator.testnet');
    setEnv('TICKET_E2E_ORGANIZER_ACCOUNT', 'ticket-org.testnet');
    setEnv('E2E_COUNTERPARTY_ACCOUNT', 'buyer.testnet');
    setEnv('TICKET_E2E_BUYER_ACCOUNT', 'ticket-buy.testnet');
    expect(resolveE2eSignerAccount('primary')).toBe('creator.testnet');
    expect(resolveE2eSignerAccount('counterparty')).toBe('buyer.testnet');
  });

  it('falls back to TICKET_E2E_* when generic aliases are unset', () => {
    setEnv('E2E_SIGNER_ACCOUNT', undefined);
    setEnv('E2E_COUNTERPARTY_ACCOUNT', undefined);
    setEnv('ACCOUNT_ID', undefined);
    setEnv('TEST_ACCOUNT_ID', undefined);
    setEnv('SECONDARY_ACCOUNT_ID', undefined);
    setEnv('TICKET_E2E_ORGANIZER_ACCOUNT', 'ticket-org.testnet');
    setEnv('TICKET_E2E_BUYER_ACCOUNT', 'ticket-buy.testnet');
    expect(resolveE2eSignerAccount('primary')).toBe('ticket-org.testnet');
    expect(resolveE2eSignerAccount('counterparty')).toBe('ticket-buy.testnet');
  });

  it('loads a keypair from a 32-byte seed without exposing the secret in account fields', () => {
    const seedHex =
      '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
    const encoded = `ed25519:${base58Encode(Buffer.from(seedHex, 'hex'))}`;
    const keypair = decodeNearKeypair('alice.testnet', encoded);
    expect(keypair.accountId).toBe('alice.testnet');
    expect(keypair.publicKey.startsWith('ed25519:')).toBe(true);
    expect(keypair.accountId.includes(seedHex)).toBe(false);
  });

  it('reports whether a signer role is present', () => {
    setEnv('E2E_SIGNER_ACCOUNT', undefined);
    setEnv('E2E_SIGNER_PRIVATE_KEY', undefined);
    setEnv('TICKET_E2E_ORGANIZER_ACCOUNT', undefined);
    setEnv('TICKET_E2E_ORGANIZER_PRIVATE_KEY', undefined);
    setEnv('ACCOUNT_ID', undefined);
    setEnv('TEST_ACCOUNT_ID', undefined);
    setEnv('TEST_PRIVATE_KEY', undefined);
    expect(hasE2eSigner('primary')).toBe(false);
  });
});
