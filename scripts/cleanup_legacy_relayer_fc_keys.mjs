#!/usr/bin/env node
/**
 * Delete legacy FunctionCall access keys from the relayer account.
 *
 * The NEP-366 relayer uses FullAccess delegate signer lanes, so relayer-owned
 * contract-scoped FunctionCall keys should be removed after the delegate pool
 * is deployed and verified. This script is dry-run by default and never deletes
 * FullAccess keys.
 *
 * Usage:
 *   node scripts/cleanup_legacy_relayer_fc_keys.mjs --network testnet
 *   node scripts/cleanup_legacy_relayer_fc_keys.mjs --network testnet --apply
 *   node scripts/cleanup_legacy_relayer_fc_keys.mjs --network mainnet --keyring relayer-keys-mainnet --apply
 */
import { Account, JsonRpcProvider, PublicKey, actions } from 'near-api-js';
import { KmsSigner } from './lib/kms-signer.mjs';

const args = process.argv.slice(2);

function readArg(name, fallback = undefined) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function usage() {
  console.log(`Usage:
  node scripts/cleanup_legacy_relayer_fc_keys.mjs [options]

Options:
  --network <testnet|mainnet>      Network, defaults to NEAR_NETWORK or testnet
  --relayer-account-id <account>   Relayer account override
  --rpc-url <url>                  RPC URL override
  --project <project>              GCP project, defaults to GCP_KMS_PROJECT or onsocial-protocol
  --location <location>            GCP KMS location, defaults to GCP_KMS_LOCATION or global
  --keyring <keyring>              KMS admin keyring override
  --admin-key <name>               KMS admin key name, defaults to GCP_KMS_ADMIN_KEY or admin-key
  --keep-recent <N>                Keep N most recently used FunctionCall keys, defaults to 0
  --apply                          Delete keys. Without this flag, only prints a dry-run plan
  -h, --help                       Show this help`);
}

if (hasFlag('-h') || hasFlag('--help')) {
  usage();
  process.exit(0);
}

const NETWORK = readArg('--network', process.env.NEAR_NETWORK || 'testnet');
if (!['testnet', 'mainnet'].includes(NETWORK)) {
  throw new Error('--network must be testnet or mainnet');
}

const IS_MAINNET = NETWORK === 'mainnet';
const RELAYER_ACCOUNT = readArg(
  '--relayer-account-id',
  process.env.RELAYER_ACCOUNT_ID || (IS_MAINNET ? 'relayer.onsocial.near' : 'relayer.onsocial.testnet'),
);
const RPC_URL = readArg(
  '--rpc-url',
  process.env.RELAYER_RPC_URL || (IS_MAINNET ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com'),
);
const GCP_PROJECT = readArg('--project', process.env.GCP_KMS_PROJECT || 'onsocial-protocol');
const GCP_LOCATION = readArg('--location', process.env.GCP_KMS_LOCATION || 'global');
const GCP_KEYRING = readArg(
  '--keyring',
  process.env.GCP_KMS_KEYRING || (IS_MAINNET ? 'relayer-keys-mainnet' : 'relayer-keys-testnet'),
);
const ADMIN_KEY = readArg('--admin-key', process.env.GCP_KMS_ADMIN_KEY || 'admin-key');
const KEEP_RECENT = Number.parseInt(readArg('--keep-recent', '0'), 10);
const APPLY = hasFlag('--apply');
const BATCH_SIZE = 100;

if (!Number.isInteger(KEEP_RECENT) || KEEP_RECENT < 0) {
  throw new Error('--keep-recent must be a non-negative integer');
}

function permissionKind(permission) {
  if (permission === 'FullAccess') return 'FullAccess';
  if (permission?.FunctionCall) return 'FunctionCall';
  return 'Unknown';
}

function receiverFor(permission) {
  return permission?.FunctionCall?.receiver_id || permission?.FunctionCall?.receiverId || '';
}

async function main() {
  console.log(`Network:    ${NETWORK}`);
  console.log(`Account:    ${RELAYER_ACCOUNT}`);
  console.log(`RPC:        ${RPC_URL}`);
  console.log(`Admin KMS:  ${GCP_KEYRING}/${ADMIN_KEY}`);
  console.log(`Mode:       ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Keep recent FunctionCall keys: ${KEEP_RECENT}`);
  console.log('');

  const provider = new JsonRpcProvider({ url: RPC_URL });
  const keyList = await provider.query({
    request_type: 'view_access_key_list',
    finality: 'final',
    account_id: RELAYER_ACCOUNT,
  });

  const allKeys = keyList.keys || [];
  const fullAccessKeys = allKeys.filter((key) => permissionKind(key.access_key.permission) === 'FullAccess');
  const functionCallKeys = allKeys
    .filter((key) => permissionKind(key.access_key.permission) === 'FunctionCall')
    .sort((a, b) => Number(b.access_key.nonce || 0) - Number(a.access_key.nonce || 0));

  const keysToKeep = new Set(functionCallKeys.slice(0, KEEP_RECENT).map((key) => key.public_key));
  const keysToDelete = functionCallKeys.filter((key) => !keysToKeep.has(key.public_key));

  console.log(`Total access keys:      ${allKeys.length}`);
  console.log(`FullAccess keys kept:   ${fullAccessKeys.length}`);
  console.log(`FunctionCall keys found:${functionCallKeys.length}`);
  console.log(`FunctionCall keys kept: ${keysToKeep.size}`);
  console.log(`FunctionCall keys delete:${keysToDelete.length}`);
  console.log('');

  if (functionCallKeys.length > 0) {
    console.log('FunctionCall keys:');
    for (const key of functionCallKeys) {
      const marker = keysToKeep.has(key.public_key) ? 'KEEP' : 'DELETE';
      const receiver = receiverFor(key.access_key.permission);
      console.log(`  ${marker} ${key.public_key} nonce=${key.access_key.nonce} receiver=${receiver}`);
    }
    console.log('');
  }

  if (keysToDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply after the delegate relayers are deployed and /ready is green.');
    return;
  }

  const signer = await KmsSigner.create({
    project: GCP_PROJECT,
    location: GCP_LOCATION,
    keyring: GCP_KEYRING,
    keyName: ADMIN_KEY,
  });
  const account = new Account(RELAYER_ACCOUNT, provider, signer);

  let deleted = 0;
  const totalBatches = Math.ceil(keysToDelete.length / BATCH_SIZE);
  for (let offset = 0; offset < keysToDelete.length; offset += BATCH_SIZE) {
    const batch = keysToDelete.slice(offset, offset + BATCH_SIZE);
    const batchNum = Math.floor(offset / BATCH_SIZE) + 1;
    console.log(`Deleting batch ${batchNum}/${totalBatches}: ${batch.length} FunctionCall keys`);

    const result = await account.signAndSendTransaction({
      receiverId: RELAYER_ACCOUNT,
      actions: batch.map((key) => actions.deleteKey(PublicKey.from(key.public_key))),
    });
    deleted += batch.length;
    console.log(`  TX: ${result.transaction.hash} (${deleted}/${keysToDelete.length})`);
  }

  console.log(`Done. Deleted ${deleted} legacy FunctionCall keys.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
