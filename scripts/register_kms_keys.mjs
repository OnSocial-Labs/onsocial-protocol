#!/usr/bin/env node
/**
 * Register KMS public keys as function-call access keys on the relayer account.
 * Network-aware: set NEAR_NETWORK=mainnet to target mainnet.
 */
import { Account, JsonRpcProvider } from 'near-api-js';
import { KmsSigner } from './lib/kms-signer.mjs';

const NETWORK = process.env.NEAR_NETWORK || 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';
const RELAYER_ACCOUNT = process.env.RELAYER_ACCOUNT_ID
  || (IS_MAINNET ? 'relayer.onsocial.near' : 'relayer.onsocial.testnet');
const CORE_CONTRACT = process.env.RELAYER_CONTRACT_ID
  || (IS_MAINNET ? 'core.onsocial.near' : 'core.onsocial.testnet');
const RPC_URL = process.env.RELAYER_RPC_URL
  || (IS_MAINNET ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
// Sync with: packages/onsocial-rpc/src/index.ts FALLBACK_RPC_URLS

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

  // Register each KMS key
  for (const pubKey of KMS_KEYS) {
    console.log(`\nAdding key: ${pubKey}`);
    try {
      const result = await account.addFunctionCallAccessKey({
        publicKey: pubKey,
        contractId: CORE_CONTRACT,
        methodNames: ALLOWED_METHODS,
        allowance: ALLOWANCE,
      });
      console.log(`  ✓ TX: ${result.transaction.hash}`);
    } catch (err) {
      if (err.message?.includes('already exists')) {
        console.log(`  ⚠ Key already registered`);
      } else {
        console.error(`  ✗ Error: ${err.message}`);
      }
    }
  }

  console.log('\nDone! Verifying keys...');
  const keyList = await account.getAccessKeyList();
  const keys = keyList.keys || keyList;
  const kmsRegistered = (Array.isArray(keys) ? keys : []).filter(k => {
    const pk = k.public_key || k.publicKey;
    return KMS_KEYS.includes(pk);
  });
  console.log(`Found ${kmsRegistered.length}/${KMS_KEYS.length} KMS keys registered`);
  for (const k of kmsRegistered) {
    const pk = k.public_key || k.publicKey;
    const perm = k.access_key?.permission || k.accessKey?.permission;
    console.log(`  ${pk} → ${JSON.stringify(perm)}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
