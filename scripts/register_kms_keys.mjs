#!/usr/bin/env node
/**
 * Register KMS public keys as function-call access keys on the relayer account.
 * Each key is registered for EVERY target contract (NEAR requires one
 * receiver_id per FunctionCall key, so each (key, contract) pair needs
 * a separate on-chain AddKey TX).
 *
 * Network-aware: set NEAR_NETWORK=mainnet to target mainnet.
 *
 * Usage:
 *   node scripts/register_kms_keys.mjs                     # all contracts
 *   node scripts/register_kms_keys.mjs scarces.onsocial.testnet  # one contract
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

// All contracts the relayer routes to.
// Sync with: RELAYER_ALLOWED_CONTRACTS + RELAYER_CONTRACT_ID in deployment/docker-compose.yml
const TARGET_CONTRACTS = process.env.RELAYER_TARGET_CONTRACTS
  ? process.env.RELAYER_TARGET_CONTRACTS.split(',').map(s => s.trim())
  : IS_MAINNET
    ? ['core.onsocial.near',    'scarces.onsocial.near']
    : ['core.onsocial.testnet', 'scarces.onsocial.testnet'];

// KMS public keys to register
const KMS_KEYS = [
  'ed25519:E92v8YJe43fbaMfWDKxeJNBSQJj8wxWincK3xJYjLMqn',
  'ed25519:6j8aX2DXe9HiaDFNorRPkLf6UEA6znB16s5kiPuu3jKk',
  'ed25519:4g7FtkMpzaoJEysfK67RgHeza6iRurVy1xoWm6Be8TdC',
];

const ALLOWED_METHODS = [
  'execute',
];

const ALLOWANCE = BigInt('1000000000000000000000000');

async function main() {
  // Optional CLI filter: only register for a specific contract
  const filterContract = process.argv[2] || null;
  const contracts = filterContract
    ? [filterContract]
    : TARGET_CONTRACTS;

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
  console.log(`Contracts: ${contracts.join(', ')}`);
  console.log(`Keys: ${KMS_KEYS.length}`);
  console.log(`Total AddKey TXs: ${KMS_KEYS.length * contracts.length}\n`);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  // Register each (key, contract) pair
  for (const contractId of contracts) {
    console.log(`\n=== Contract: ${contractId} ===`);
    for (const pubKey of KMS_KEYS) {
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
    if (!byContract[receiver]) byContract[receiver] = [];
    byContract[receiver].push(k.public_key || k.publicKey);
  }
  for (const [contract, pks] of Object.entries(byContract)) {
    console.log(`\n  ${contract}: ${pks.length} keys`);
    for (const pk of pks) {
      const isKms = KMS_KEYS.includes(pk);
      console.log(`    ${pk}${isKms ? ' (KMS)' : ''}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
