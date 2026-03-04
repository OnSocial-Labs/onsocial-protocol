#!/usr/bin/env node
/**
 * Register KMS public keys as function-call access keys on the relayer account.
 *
 * Each KMS pool key is assigned to exactly ONE contract. NEAR requires one
 * receiver_id per FunctionCall key, so each key can only sign for one contract.
 *
 * Key allocation (per keyring, same for both instances):
 *   pool-key-0..2  → core
 *   pool-key-3..5  → scarces
 *   pool-key-6..8  → rewards
 *
 * Network-aware: set NEAR_NETWORK=mainnet to target mainnet.
 *
 * Usage:
 *   node scripts/register_kms_keys.mjs                           # all contracts
 *   node scripts/register_kms_keys.mjs rewards.onsocial.testnet  # one contract
 */
import { Account, JsonRpcProvider } from 'near-api-js';
import { KmsSigner } from './lib/kms-signer.mjs';

const NETWORK = process.env.NEAR_NETWORK || 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';
const RELAYER_ACCOUNT = process.env.RELAYER_ACCOUNT_ID
  || (IS_MAINNET ? 'relayer.onsocial.near' : 'relayer.onsocial.testnet');
const RPC_URL = process.env.RELAYER_RPC_URL
  || (IS_MAINNET ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
// Sync with: packages/onsocial-rpc/src/index.ts FALLBACK_RPC_URLS

// ── Contract → key mapping ─────────────────────────────────────────────
// Each entry maps a contract to the KMS public keys that should be
// registered as FunctionCall access keys for that contract.
// Sync with: RELAYER_ALLOWED_CONTRACTS + RELAYER_CONTRACT_ID in deployment/docker-compose.yml
const CONTRACT_KEYS = IS_MAINNET
  ? {
      'core.onsocial.near': [
        // pool-key-0..2 (keyring-0) — assigned per on-chain registration
        // pool-key-3..5 (keyring-1) — assigned per on-chain registration
      ],
      'scarces.onsocial.near': [],
      'rewards.onsocial.near': [],
    }
  : {
      'core.onsocial.testnet': [
        // keyring-0 (relayer-keys-testnet): pool-key-0, 1, 2
        'ed25519:E92v8YJe43fbaMfWDKxeJNBSQJj8wxWincK3xJYjLMqn',
        'ed25519:6j8aX2DXe9HiaDFNorRPkLf6UEA6znB16s5kiPuu3jKk',
        'ed25519:4g7FtkMpzaoJEysfK67RgHeza6iRurVy1xoWm6Be8TdC',
        // keyring-1 (relayer-keys-inst-1): pool-key-0, 1, 2
        'ed25519:7F2jGTZWpGGQkBDuB2jixuk3MNpox7N1pyedUUF7Y5M7',
        'ed25519:gsW2E2nKZHey2u7pwdsAkfbYpZWTyfTfQCoznbQbDzj',
        'ed25519:7rRbLQhH5ajcquaE9drS5V9BuutVE5vQ6UEdozTXtMjd',
      ],
      'scarces.onsocial.testnet': [
        // keyring-0 (relayer-keys-testnet): pool-key-3, 4, 5
        'ed25519:7JBGZ14HFqc9nCPSJRwNNXGqzKu13wnv6ht3ByXP59nu',
        'ed25519:7cStETZFeJbPFZcpLYarBQpZy9tmSpZguKGxhKFTSEp1',
        'ed25519:Hi69YTpDMoGGhLByvToQEC84SUDod4Jyk533WkVY2qKr',
        // keyring-1 (relayer-keys-inst-1): pool-key-3, 4, 5
        'ed25519:6VCHBVJgGKx1TeHTmJfAcTQLu4VibN8YdGVeyaTPC6Rx',
        'ed25519:3qvbnrYLPn1GZSBedHjvEuC1CR9CCDMf7Txw1g4cfSG4',
        'ed25519:Fr2BXEjD5CGd3xY2rhnExGMep6cP1gJh4XEtinYPW8eo',
      ],
      'rewards.onsocial.testnet': [
        // keyring-0 (relayer-keys-testnet): pool-key-6, 7, 8
        'ed25519:9ELHXpMZ7LPNJ7LsBSPKDS9JDeMm1713E7dArSdxESL2',
        'ed25519:jzormw9q7Ld5KvH9rwu7gMigq5UDXPCsiQ9NRCoyQi2',
        'ed25519:8Gka4u9WzJxVQsQqcktwJfYFpQTFQ3p7b2Z5CUK9qZ3K',
        // keyring-1 (relayer-keys-inst-1): pool-key-6, 7, 8
        'ed25519:AtjVBaz4GfYo33seMB3vuvtB7sbk1KFswkfkVKrBvJUF',
        'ed25519:C4yV3YUtPiRWUhbeSzRJ9Cp8qyWmCAFXXBavFPfHAtDN',
        'ed25519:9erda85LYQhSMFPqbgHh8riR19YszeuTaaR9mfoqjnks',
      ],
    };

// Flat list for the verification step
const ALL_KMS_KEYS = new Set(Object.values(CONTRACT_KEYS).flat());

const ALLOWED_METHODS = [
  'execute',
];

const ALLOWANCE = BigInt('1000000000000000000000000');

async function main() {
  // Optional CLI filter: only register for a specific contract
  const filterContract = process.argv[2] || null;
  const contracts = filterContract
    ? { [filterContract]: CONTRACT_KEYS[filterContract] || [] }
    : CONTRACT_KEYS;

  const provider = new JsonRpcProvider({ url: RPC_URL });
  const signer = await KmsSigner.create({
    project:  process.env.GCP_KMS_PROJECT  || 'onsocial-protocol',
    location: process.env.GCP_KMS_LOCATION || 'global',
    keyring:  process.env.GCP_KMS_KEYRING  || (IS_MAINNET ? 'relayer-keys-mainnet' : 'relayer-keys-testnet'),
    keyName:  process.env.GCP_KMS_ADMIN_KEY || 'admin-key',
  });
  const account = new Account(RELAYER_ACCOUNT, provider, signer);
  
  // Verify account exists
  const state = await account.getState();
  console.log(`Account ${RELAYER_ACCOUNT}: ${state.amount} yoctoNEAR`);

  const totalKeys = Object.values(contracts).reduce((n, ks) => n + ks.length, 0);
  console.log(`Contracts: ${Object.keys(contracts).join(', ')}`);
  console.log(`Total AddKey TXs: ${totalKeys}\n`);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  // Register each key for its designated contract only
  for (const [contractId, keys] of Object.entries(contracts)) {
    if (keys.length === 0) {
      console.log(`\n=== Contract: ${contractId} === (no keys configured, skipping)`);
      continue;
    }
    console.log(`\n=== Contract: ${contractId} === (${keys.length} keys)`);
    for (const pubKey of keys) {
      console.log(`  Adding key ${pubKey} → ${contractId}`);
      try {
        const result = await account.addFunctionCallAccessKey({
          publicKey: pubKey,
          contractId,
          methodNames: ALLOWED_METHODS,
          allowance: ALLOWANCE,
        });
        console.log(`    ✓ TX: ${result.transaction.hash}`);
        added++;
      } catch (err) {
        if (err.message?.includes('already exists')) {
          console.log(`    ⚠ Key already registered`);
          skipped++;
        } else {
          console.error(`    ✗ Error: ${err.message}`);
          failed++;
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Added: ${added}  Skipped: ${skipped}  Failed: ${failed}`);

  console.log('\nVerifying keys...');
  const keyList = await account.getAccessKeyList();
  const keys = keyList.keys || keyList;
  const fcKeys = (Array.isArray(keys) ? keys : []).filter(k => {
    const perm = k.access_key?.permission || k.accessKey?.permission;
    return perm && typeof perm === 'object' && perm.FunctionCall;
  });

  // Group by contract
  const byContract = {};
  for (const k of fcKeys) {
    const perm = k.access_key?.permission || k.accessKey?.permission;
    const receiver = perm?.FunctionCall?.receiver_id;
    byContract[receiver] = byContract[receiver] || [];
    byContract[receiver].push(k.public_key || k.publicKey);
  }
  for (const [contract, pks] of Object.entries(byContract)) {
    console.log(`\n  ${contract}: ${pks.length} keys`);
    for (const pk of pks) {
      const isKms = ALL_KMS_KEYS.has(pk);
      console.log(`    ${pk}${isKms ? ' (KMS)' : ''}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
