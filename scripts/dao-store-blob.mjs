#!/usr/bin/env node
/**
 * Call store_blob on a Sputnik DAO with attached storage deposit.
 * Prints the base58 code hash for UpgradeSelf proposals.
 *
 * Usage:
 *   NETWORK=testnet SIGNER=onsocial.testnet DAO=treasury.onsocial.testnet \
 *     node scripts/dao-store-blob.mjs deployment/governance-dao/artifacts/sputnikdao2.wasm
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { Account } from '@near-js/accounts';
import { UnencryptedFileSystemKeyStore } from '@near-js/keystores-node';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
  let num = 0n;
  for (const byte of bytes) {
    num = (num << 8n) + BigInt(byte);
  }
  let out = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    num /= 58n;
    out = B58_ALPHABET[rem] + out;
  }
  for (const byte of bytes) {
    if (byte === 0) out = `1${out}`;
    else break;
  }
  return out || '1';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const wasmPath = process.argv[2];
  if (!wasmPath) {
    fail(
      'Usage: NETWORK=testnet SIGNER=<account> DAO=<dao> node scripts/dao-store-blob.mjs <wasm-path>'
    );
  }

  const network = process.env.NETWORK || 'testnet';
  const signerId = process.env.SIGNER;
  const daoId = process.env.DAO;
  if (!signerId || !daoId) {
    fail('SIGNER and DAO are required');
  }

  const absoluteWasm = path.resolve(process.cwd(), wasmPath);
  if (!fs.existsSync(absoluteWasm)) {
    fail(`WASM not found: ${absoluteWasm}`);
  }

  const wasmBytes = fs.readFileSync(absoluteWasm);
  const codeHashB58 = base58Encode(createHash('sha256').update(wasmBytes).digest());

  // storage_byte_cost is 10^19 yocto; blob stores value + 32-byte key.
  const storageByteCost = 10n ** 19n;
  const storageCost = BigInt(wasmBytes.length + 32) * storageByteCost;
  const deposit = storageCost + 10n ** 22n;

  console.log('store_blob');
  console.log('  dao:', daoId);
  console.log('  signer:', signerId);
  console.log('  network:', network);
  console.log('  wasm bytes:', wasmBytes.length);
  console.log('  expected hash (b58):', codeHashB58);
  console.log('  deposit yocto:', deposit.toString());

  const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), '.near-credentials'));
  const nodeUrl =
    process.env.NEAR_RPC_URL ||
    (network === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
  const provider = new JsonRpcProvider({ url: nodeUrl });
  const keyPair = await keyStore.getKey(network, signerId);
  if (!keyPair) {
    fail(`No key for ${signerId} on ${network}`);
  }

  if (process.env.DRY_RUN === '1') {
    console.log('DRY RUN — would call store_blob');
    console.log(JSON.stringify({ hash: codeHashB58 }, null, 2));
    process.exit(0);
  }

  const account = new Account(signerId, provider, new KeyPairSigner(keyPair));
  const outcome = await account.signAndSendTransaction({
    receiverId: daoId,
    actions: [
      {
        functionCall: {
          methodName: 'store_blob',
          args: wasmBytes,
          gas: BigInt('100000000000000'),
          deposit,
        },
      },
    ],
  });

  const txHash = outcome.transaction_outcome?.id || outcome.transaction?.hash || 'see explorer';
  console.log('Tx:', txHash);
  if (outcome.status?.Failure) {
    console.error('Failure:', JSON.stringify(outcome.status.Failure, null, 2));
    process.exit(1);
  }

  let returned = null;
  if (outcome.status?.SuccessValue) {
    try {
      returned = JSON.parse(Buffer.from(outcome.status.SuccessValue, 'base64').toString());
    } catch {
      returned = Buffer.from(outcome.status.SuccessValue, 'base64').toString();
    }
  }

  console.log('store_blob returned:', returned);
  console.log('UpgradeSelf hash (base58):', codeHashB58);
  console.log(JSON.stringify({ dao: daoId, hash: codeHashB58, tx: txHash }, null, 2));
}

main().catch((err) => {
  console.error('❌ store_blob failed:', err.message);
  if (err.cause) console.error('Cause:', err.cause.message || err.cause);
  process.exit(1);
});
