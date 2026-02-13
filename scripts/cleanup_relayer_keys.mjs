#!/usr/bin/env node
/**
 * Batch-delete stale function-call access keys from the relayer account.
 * Keeps: all FullAccess keys, KMS pool keys, and top KEEP_FC_KEYS by nonce.
 * Sends DeleteKey actions in batches of 100.
 * Network-aware: set NEAR_NETWORK=mainnet to target mainnet.
 */
import { Account, JsonRpcProvider, PublicKey, actions } from 'near-api-js';
import { KmsSigner } from './lib/kms-signer.mjs';

const NETWORK = process.env.NEAR_NETWORK || 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';
const RELAYER_ACCOUNT = process.env.RELAYER_ACCOUNT_ID
  || (IS_MAINNET ? 'relayer.onsocial.near' : 'relayer.onsocial.testnet');
const RPC_URL = process.env.RELAYER_RPC_URL
  || (IS_MAINNET ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
// Sync with: packages/onsocial-rpc/src/index.ts FALLBACK_RPC_URLS
const BATCH_SIZE = 100;
const KEEP_FC_KEYS = 0;

// KMS pool keys to preserve — both instances
const KMS_KEYS = new Set([
  // Instance 0 (relayer-keys-testnet)
  'ed25519:E92v8YJe43fbaMfWDKxeJNBSQJj8wxWincK3xJYjLMqn',
  'ed25519:6j8aX2DXe9HiaDFNorRPkLf6UEA6znB16s5kiPuu3jKk',
  'ed25519:4g7FtkMpzaoJEysfK67RgHeza6iRurVy1xoWm6Be8TdC',
  // Instance 1 (relayer-keys-inst-1)
  'ed25519:7F2jGTZWpGGQkBDuB2jixuk3MNpox7N1pyedUUF7Y5M7',
  'ed25519:gsW2E2nKZHey2u7pwdsAkfbYpZWTyfTfQCoznbQbDzj',
  'ed25519:7rRbLQhH5ajcquaE9drS5V9BuutVE5vQ6UEdozTXtMjd',
]);

async function main() {
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const signer = await KmsSigner.create({
    project:  process.env.GCP_KMS_PROJECT  || 'onsocial-protocol',
    location: process.env.GCP_KMS_LOCATION || 'global',
    keyring:  process.env.GCP_KMS_KEYRING  || (IS_MAINNET ? 'relayer-keys-mainnet' : 'relayer-keys-testnet'),
    keyName:  process.env.GCP_KMS_ADMIN_KEY || 'admin-key',
  });
  const account = new Account(RELAYER_ACCOUNT, provider, signer);

  // Fetch all keys
  const result = await provider.query({
    request_type: 'view_access_key_list',
    finality: 'final',
    account_id: RELAYER_ACCOUNT,
  });
  const allKeys = result.keys;

  console.log(`Total keys on-chain: ${allKeys.length}`);

  // Separate full-access and function-call keys
  const fullAccessKeys = allKeys.filter(k => k.access_key.permission === 'FullAccess');
  const fcKeys = allKeys.filter(k => k.access_key.permission !== 'FullAccess');

  console.log(`Full-access keys: ${fullAccessKeys.length} (keeping all)`);
  console.log(`Function-call keys: ${fcKeys.length}`);

  // Sort FC keys by nonce descending (higher nonce = more recently used)
  fcKeys.sort((a, b) => b.access_key.nonce - a.access_key.nonce);

  // Keep KMS keys + top N most-recently-used
  const keysToDelete = [];
  let kept = 0;
  for (const k of fcKeys) {
    if (KMS_KEYS.has(k.public_key)) {
      console.log(`  Preserving KMS key: ${k.public_key}`);
      continue;
    }
    if (kept < KEEP_FC_KEYS) {
      kept++;
      console.log(`  Keeping recent key #${kept}: ${k.public_key} (nonce: ${k.access_key.nonce})`);
      continue;
    }
    keysToDelete.push(k.public_key);
  }

  console.log(`\nKeys to delete: ${keysToDelete.length}`);
  const storageSaved = keysToDelete.length * 120;
  const nearFreed = (storageSaved * 1e19) / 1e24;
  console.log(`Estimated storage freed: ${storageSaved} bytes (~${nearFreed.toFixed(2)} NEAR)`);

  if (keysToDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  // Delete in batches
  const totalBatches = Math.ceil(keysToDelete.length / BATCH_SIZE);
  let deleted = 0;

  for (let i = 0; i < keysToDelete.length; i += BATCH_SIZE) {
    const batch = keysToDelete.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\nBatch ${batchNum}/${totalBatches}: deleting ${batch.length} keys...`);

    try {
      const result = await account.signAndSendTransaction({
        receiverId: RELAYER_ACCOUNT,
        actions: batch.map(pk => actions.deleteKey(PublicKey.from(pk))),
      });
      deleted += batch.length;
      console.log(`  ✓ TX: ${result.transaction.hash} (${deleted}/${keysToDelete.length} deleted)`);
    } catch (err) {
      console.error(`  ✗ Batch failed: ${err.message}`);
    }
  }

  console.log(`\nDone! Deleted ${deleted}/${keysToDelete.length} keys.`);

  // Verify final state
  const finalResult = await provider.query({
    request_type: 'view_access_key_list',
    finality: 'final',
    account_id: RELAYER_ACCOUNT,
  });
  console.log(`Remaining keys: ${finalResult.keys.length}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
