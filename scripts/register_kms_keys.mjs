#!/usr/bin/env node
/**
 * Register KMS pool keys as FunctionCall access keys on the relayer account.
 *
 * DYNAMIC: fetches public keys from KMS at runtime. No hardcoded keys.
 * Distributes keys evenly across contracts using round-robin.
 *
 * Key allocation formula (per keyring):
 *   pool-key-{i} → contracts[i % num_contracts]
 *
 * Example with 9 keys and 3 contracts:
 *   pool-key-0,3,6 → core
 *   pool-key-1,4,7 → scarces
 *   pool-key-2,5,8 → rewards
 *
 * Network-aware: set NEAR_NETWORK=mainnet to target mainnet.
 *
 * Usage:
 *   node scripts/register_kms_keys.mjs                           # all keyrings
 *   node scripts/register_kms_keys.mjs --keyring relayer-keys-testnet  # one keyring
 *   node scripts/register_kms_keys.mjs --pool-size 15            # override pool size
 *   node scripts/register_kms_keys.mjs --dry-run                 # preview only
 */
import { Account, JsonRpcProvider } from 'near-api-js';
import { KmsSigner } from './lib/kms-signer.mjs';
import { execSync } from 'child_process';

const NETWORK = process.env.NEAR_NETWORK || 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';
const RELAYER_ACCOUNT = process.env.RELAYER_ACCOUNT_ID
  || (IS_MAINNET ? 'relayer.onsocial.near' : 'relayer.onsocial.testnet');
const RPC_URL = process.env.RELAYER_RPC_URL
  || (IS_MAINNET ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');

// ── Contracts — all treated equally unless explicitly overridden ───────
const DEFAULT_CONTRACTS = IS_MAINNET
  ? [
      'core.onsocial.near',
      'scarces.onsocial.near',
      'rewards.onsocial.near',
    ]
  : [
      'core.onsocial.testnet',
      'scarces.onsocial.testnet',
      'rewards.onsocial.testnet',
    ];

const CONTRACTS = (process.env.RELAYER_ALLOWED_CONTRACTS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (CONTRACTS.length === 0) {
  CONTRACTS.push(...DEFAULT_CONTRACTS);
}

// ── Keyrings (one per relayer instance) ──────────────────────────────────
const KEYRINGS = IS_MAINNET
  ? [
      'relayer-keys-mainnet',
      'relayer-keys-mainnet-1',
      // Add more keyrings here for more instances
    ]
  : [
      'relayer-keys-testnet',
      'relayer-keys-inst-1',
      // Add more keyrings here for more instances
    ];

const GCP_PROJECT  = process.env.GCP_KMS_PROJECT  || 'onsocial-protocol';
const GCP_LOCATION = process.env.GCP_KMS_LOCATION || 'global';
const DEFAULT_POOL_SIZE = IS_MAINNET ? 50 : 30;
const POOL_SIZE    = parseInt(process.env.GCP_KMS_POOL_SIZE || String(DEFAULT_POOL_SIZE), 10);
const KMS_BASE     = 'https://cloudkms.googleapis.com/v1';

const ALLOWED_METHODS = ['execute'];
const ALLOWANCE = BigInt('1000000000000000000000000');

// ── CLI args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const keyringFilter = (() => {
  const idx = args.indexOf('--keyring');
  return idx >= 0 ? args[idx + 1] : null;
})();
const poolSizeOverride = (() => {
  const idx = args.indexOf('--pool-size');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null;
})();
const poolSize = poolSizeOverride || POOL_SIZE;

/** Fetch Ed25519 public key from KMS key version → "ed25519:..." */
async function getKmsPublicKey(keyring, keyName, version = 1) {
  const resourceName =
    `projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/keyRings/${keyring}/cryptoKeys/${keyName}/cryptoKeyVersions/${version}`;
  const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

  const resp = await fetch(`${KMS_BASE}/${resourceName}/publicKey`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 404) return null; // Key doesn't exist yet
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

async function main() {
  const keyrings = keyringFilter ? [keyringFilter] : KEYRINGS;

  console.log(`Network:    ${NETWORK}`);
  console.log(`Account:    ${RELAYER_ACCOUNT}`);
  console.log(`Contracts:  ${CONTRACTS.join(', ')}`);
  console.log(`Keyrings:   ${keyrings.join(', ')}`);
  console.log(`Pool size:  ${poolSize} keys/keyring`);
  console.log(`Keys/contract/keyring: ${Math.floor(poolSize / CONTRACTS.length)}`);
  console.log(`Total keys: ${keyrings.length * poolSize}`);
  if (dryRun) console.log('  ** DRY RUN — no on-chain changes **\n');
  else console.log('');

  // ── Step 1: Discover all KMS public keys ──────────────────────────────
  console.log('=== Discovering KMS public keys ===\n');
  const plan = []; // [{ keyring, keyName, pubKey, contract }]

  for (const keyring of keyrings) {
    for (let i = 0; i < poolSize; i++) {
      const keyName = `pool-key-${i}`;
      const contract = CONTRACTS[i % CONTRACTS.length]; // Round-robin

      process.stdout.write(`  ${keyring}/${keyName} → ${contract} ... `);
      const pubKey = await getKmsPublicKey(keyring, keyName);
      if (!pubKey) {
        console.log('NOT FOUND (skipping)');
        continue;
      }
      console.log(pubKey);
      plan.push({ keyring, keyName, pubKey, contract });
    }
    console.log('');
  }

  console.log(`\nDiscovered ${plan.length} keys across ${keyrings.length} keyrings\n`);

  // ── Step 2: Show allocation ───────────────────────────────────────────
  console.log('=== Key allocation ===\n');
  for (const contract of CONTRACTS) {
    const keys = plan.filter(p => p.contract === contract);
    console.log(`  ${contract}: ${keys.length} keys`);
    for (const k of keys) {
      console.log(`    ${k.keyring}/${k.keyName} → ${k.pubKey}`);
    }
  }
  console.log('');

  if (dryRun) {
    console.log('Dry run complete. No keys registered.');
    return;
  }

  // ── Step 3: Register on-chain ─────────────────────────────────────────
  // Use the first keyring's admin key for signing
  const adminKeyring = keyrings[0];
  console.log(`=== Registering on-chain (admin: ${adminKeyring}/admin-key) ===\n`);

  const provider = new JsonRpcProvider({ url: RPC_URL });
  const signer = await KmsSigner.create({
    project:  GCP_PROJECT,
    location: GCP_LOCATION,
    keyring:  adminKeyring,
    keyName:  'admin-key',
  });
  const account = new Account(RELAYER_ACCOUNT, provider, signer);

  const state = await account.getState();
  console.log(`Account ${RELAYER_ACCOUNT}: ${state.amount} yoctoNEAR\n`);

  let added = 0, skipped = 0, failed = 0;

  for (const contract of CONTRACTS) {
    const keys = plan.filter(p => p.contract === contract);
    if (keys.length === 0) continue;

    console.log(`\n--- ${contract} (${keys.length} keys) ---`);
    for (const { pubKey, keyring, keyName } of keys) {
      process.stdout.write(`  AddKey ${pubKey} → ${contract} ... `);
      try {
        const result = await account.addFunctionCallAccessKey({
          publicKey: pubKey,
          contractId: contract,
          methodNames: ALLOWED_METHODS,
          allowance: ALLOWANCE,
        });
        console.log(`✓ TX: ${result.transaction.hash}`);
        added++;
      } catch (err) {
        if (err.message?.includes('already exists')) {
          console.log('⚠ already registered');
          skipped++;
        } else {
          console.log(`✗ ${err.message}`);
          failed++;
        }
      }
    }
  }

  // ── Step 4: Verify ────────────────────────────────────────────────────
  console.log(`\n=== Summary ===`);
  console.log(`  Added: ${added}  Skipped: ${skipped}  Failed: ${failed}\n`);

  console.log('Verifying on-chain keys...');
  const keyList = await account.getAccessKeyList();
  const allKeys = keyList.keys || keyList;
  const fcKeys = (Array.isArray(allKeys) ? allKeys : []).filter(k => {
    const perm = k.access_key?.permission || k.accessKey?.permission;
    return perm && typeof perm === 'object' && perm.FunctionCall;
  });

  const discoveredPubKeys = new Set(plan.map(p => p.pubKey));
  const byContract = {};
  for (const k of fcKeys) {
    const perm = k.access_key?.permission || k.accessKey?.permission;
    const receiver = perm?.FunctionCall?.receiver_id;
    byContract[receiver] = byContract[receiver] || [];
    byContract[receiver].push(k.public_key || k.publicKey);
  }
  for (const [contract, pks] of Object.entries(byContract).sort()) {
    console.log(`\n  ${contract}: ${pks.length} keys`);
    for (const pk of pks) {
      const isKms = discoveredPubKeys.has(pk);
      console.log(`    ${pk}${isKms ? ' (KMS)' : ''}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
