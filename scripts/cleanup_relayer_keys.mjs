#!/usr/bin/env node
/**
 * Batch-delete stale function-call access keys from the relayer account.
 *
 * DYNAMIC: fetches active KMS pool keys from GCP at runtime — no hardcoded
 * key lists to keep in sync.
 *
 * Keeps: all FullAccess keys, KMS pool keys, and top KEEP_FC_KEYS by nonce.
 * Sends DeleteKey actions in batches of 100.
 * Network-aware: set NEAR_NETWORK=mainnet to target mainnet.
 *
 * Usage:
 *   node scripts/cleanup_relayer_keys.mjs              # delete stale keys
 *   node scripts/cleanup_relayer_keys.mjs --dry-run    # preview only
 *   node scripts/cleanup_relayer_keys.mjs --keep 5     # keep top 5 recent non-KMS keys
 */
import { Account, JsonRpcProvider, PublicKey, actions } from 'near-api-js';
import { KmsSigner } from './lib/kms-signer.mjs';
import { execSync } from 'child_process';

const NETWORK = process.env.NEAR_NETWORK || 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';
const RELAYER_ACCOUNT = process.env.RELAYER_ACCOUNT_ID
  || (IS_MAINNET ? 'relayer.onsocial.near' : 'relayer.onsocial.testnet');
const RPC_URL = process.env.RELAYER_RPC_URL
  || (IS_MAINNET ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
const BATCH_SIZE = 100;

const GCP_PROJECT  = process.env.GCP_KMS_PROJECT  || 'onsocial-protocol';
const GCP_LOCATION = process.env.GCP_KMS_LOCATION || 'global';
const POOL_SIZE    = parseInt(process.env.GCP_KMS_POOL_SIZE || '30', 10);
const KMS_BASE     = 'https://cloudkms.googleapis.com/v1';

// ── Keyrings (must match register_kms_keys.mjs) ─────────────────────────
const KEYRINGS = IS_MAINNET
  ? [
      'relayer-keys-mainnet',
      'relayer-keys-mainnet-1',
    ]
  : [
      'relayer-keys-testnet',
      'relayer-keys-inst-1',
    ];

// ── CLI args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const keepCount = (() => {
  const idx = args.indexOf('--keep');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : 0;
})();

// ── KMS key discovery (same as register_kms_keys.mjs) ────────────────────

/** Fetch Ed25519 public key from KMS key version → "ed25519:..." */
async function getKmsPublicKey(keyring, keyName, version = 1) {
  const resourceName =
    `projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/keyRings/${keyring}/cryptoKeys/${keyName}/cryptoKeyVersions/${version}`;
  const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

  const resp = await fetch(`${KMS_BASE}/${resourceName}/publicKey`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    if (resp.status === 404) return null;
    const body = await resp.text();
    throw new Error(`KMS getPublicKey(${keyring}/${keyName}): ${resp.status} ${body}`);
  }
  const { pem } = await resp.json();

  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  const der = Buffer.from(b64, 'base64');
  const rawKey = der.subarray(der.length - 32);

  // Base58 encode
  const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = [0];
  for (const byte of rawKey) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let output = '';
  for (const byte of rawKey) {
    if (byte !== 0) break;
    output += bs58Alphabet[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    output += bs58Alphabet[digits[i]];
  }

  return `ed25519:${output}`;
}

/** Discover all KMS pool public keys across all keyrings. */
async function discoverKmsKeys() {
  const keys = new Set();
  for (const keyring of KEYRINGS) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const pubKey = await getKmsPublicKey(keyring, `pool-key-${i}`);
      if (pubKey) keys.add(pubKey);
    }
    // Also preserve the admin key
    const adminKey = await getKmsPublicKey(keyring, 'admin-key');
    if (adminKey) keys.add(adminKey);
  }
  return keys;
}

async function main() {
  console.log(`Network:   ${NETWORK}`);
  console.log(`Account:   ${RELAYER_ACCOUNT}`);
  console.log(`Keyrings:  ${KEYRINGS.join(', ')}`);
  console.log(`Pool size: ${POOL_SIZE} keys/keyring`);
  console.log(`Keep:      ${keepCount} recent non-KMS keys`);
  if (dryRun) console.log('  ** DRY RUN — no on-chain changes **');
  console.log('');

  // ── Step 1: Discover KMS keys dynamically ───────────────────────────────
  console.log('=== Discovering KMS pool keys from GCP ===\n');
  const KMS_KEYS = await discoverKmsKeys();
  console.log(`\nDiscovered ${KMS_KEYS.size} KMS keys to preserve\n`);

  // ── Step 2: Fetch on-chain keys ─────────────────────────────────────────
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const signer = await KmsSigner.create({
    project:  GCP_PROJECT,
    location: GCP_LOCATION,
    keyring:  process.env.GCP_KMS_KEYRING  || (IS_MAINNET ? 'relayer-keys-mainnet' : 'relayer-keys-testnet'),
    keyName:  process.env.GCP_KMS_ADMIN_KEY || 'admin-key',
  });
  const account = new Account(RELAYER_ACCOUNT, provider, signer);

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

  // ── Step 3: Identify stale keys ─────────────────────────────────────────
  const keysToDelete = [];
  let kept = 0;
  for (const k of fcKeys) {
    if (KMS_KEYS.has(k.public_key)) {
      console.log(`  Preserving KMS key: ${k.public_key}`);
      continue;
    }
    if (kept < keepCount) {
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

  if (dryRun) {
    console.log('\nDry run — keys that would be deleted:');
    for (const pk of keysToDelete) {
      console.log(`  ${pk}`);
    }
    return;
  }

  // ── Step 4: Delete in batches ───────────────────────────────────────────
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
