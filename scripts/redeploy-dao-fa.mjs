#!/usr/bin/env node
/**
 * Redeploy Sputnik DAO wasm via the DAO account FullAccess key.
 * One tx: DeployContract + migrate.
 *
 * Usage:
 *   NETWORK=testnet AUTH_ACCOUNT=treasury.onsocial.testnet \
 *     node scripts/redeploy-dao-fa.mjs deployment/governance-dao/artifacts/sputnikdao2.wasm
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

async function viewJson(provider, accountId, methodName, args = {}) {
  const result = await provider.query({
    request_type: 'call_function',
    account_id: accountId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    finality: 'optimistic',
  });
  return JSON.parse(Buffer.from(result.result).toString());
}

async function main() {
  const wasmPath = process.argv[2];
  if (!wasmPath) {
    fail(
      'Usage: NETWORK=testnet AUTH_ACCOUNT=<dao> node scripts/redeploy-dao-fa.mjs <wasm-path>'
    );
  }

  const network = process.env.NETWORK || 'testnet';
  const authAccount = process.env.AUTH_ACCOUNT;
  if (!authAccount) {
    fail('AUTH_ACCOUNT required (must be the DAO account with FullAccess key)');
  }

  const absoluteWasm = path.resolve(process.cwd(), wasmPath);
  if (!fs.existsSync(absoluteWasm)) {
    fail(`WASM not found: ${absoluteWasm}`);
  }

  const wasmBytes = fs.readFileSync(absoluteWasm);
  const codeHashB58 = base58Encode(createHash('sha256').update(wasmBytes).digest());

  console.log('FA DAO redeploy');
  console.log('  account:', authAccount);
  console.log('  network:', network);
  console.log('  wasm:', absoluteWasm);
  console.log('  size:', wasmBytes.length);
  console.log('  sha256(b58):', codeHashB58);

  const credentialsRoot = path.join(os.homedir(), '.near-credentials');
  const keyStore = new UnencryptedFileSystemKeyStore(credentialsRoot);
  const nodeUrl =
    process.env.NEAR_RPC_URL ||
    (network === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
  const provider = new JsonRpcProvider({ url: nodeUrl });

  const accessKeys = await provider.query({
    request_type: 'view_access_key_list',
    account_id: authAccount,
    finality: 'final',
  });
  const faPubkeys = new Set(
    (accessKeys.keys || [])
      .filter((k) => k.access_key?.permission === 'FullAccess')
      .map((k) => k.public_key)
  );

  let keyPair = await keyStore.getKey(network, authAccount);
  if (!keyPair || !faPubkeys.has(keyPair.getPublicKey().toString())) {
    // near-cli-rs stores keys under ~/.near-credentials/<network>/<account>/*.json
    const nestedDir = path.join(credentialsRoot, network, authAccount);
    if (fs.existsSync(nestedDir)) {
      for (const file of fs.readdirSync(nestedDir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(nestedDir, file), 'utf8'));
          if (raw.private_key && faPubkeys.has(raw.public_key)) {
            const { KeyPair } = await import('@near-js/crypto');
            keyPair = KeyPair.fromString(raw.private_key);
            break;
          }
        } catch {
          // skip unreadable credential files
        }
      }
    }
  }

  if (!keyPair) {
    fail(`No key for ${authAccount} on ${network}`);
  }
  if (faPubkeys.size && !faPubkeys.has(keyPair.getPublicKey().toString())) {
    fail(
      `Local key ${keyPair.getPublicKey().toString()} is not a FullAccess key on ${authAccount}`
    );
  }
  console.log('  signing:', keyPair.getPublicKey().toString());

  if (process.env.DRY_RUN === '1') {
    console.log('DRY RUN — would DeployContract + migrate');
    process.exit(0);
  }

  const account = new Account(authAccount, provider, new KeyPairSigner(keyPair));
  const outcome = await account.signAndSendTransaction({
    receiverId: authAccount,
    actions: [
      { deployContract: { code: wasmBytes } },
      {
        functionCall: {
          methodName: 'migrate',
          args: Buffer.from('{}'),
          gas: BigInt('200000000000000'),
          deposit: BigInt(0),
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

  const version = await viewJson(provider, authAccount, 'version');
  console.log('version after redeploy:', version);
  console.log('✅ FA DAO redeploy complete');
}

main().catch((err) => {
  console.error('❌ Redeploy failed:', err.message);
  if (err.cause) console.error('Cause:', err.cause.message || err.cause);
  process.exit(1);
});
