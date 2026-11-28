#!/usr/bin/env node
/**
 * Delete the FullAccess key used to sign, after a proven UpgradeSelf.
 *
 * Usage:
 *   NETWORK=testnet AUTH_ACCOUNT=treasury.onsocial.testnet \
 *     CONFIRM=DELETE_FA_KEY node scripts/dao-delete-fa-key.mjs
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Account } from '@near-js/accounts';
import { KeyPair } from '@near-js/crypto';
import { UnencryptedFileSystemKeyStore } from '@near-js/keystores-node';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function loadFaKeyPair(network, accountId, faPubkeys, credentialsRoot) {
  const keyStore = new UnencryptedFileSystemKeyStore(credentialsRoot);
  let keyPair = await keyStore.getKey(network, accountId);
  if (keyPair && faPubkeys.has(keyPair.getPublicKey().toString())) {
    return keyPair;
  }
  const nestedDir = path.join(credentialsRoot, network, accountId);
  if (fs.existsSync(nestedDir)) {
    for (const file of fs.readdirSync(nestedDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(nestedDir, file), 'utf8'));
        if (raw.private_key && faPubkeys.has(raw.public_key)) {
          return KeyPair.fromString(raw.private_key);
        }
      } catch {
        // skip
      }
    }
  }
  return null;
}

async function main() {
  const network = process.env.NETWORK || 'testnet';
  const authAccount = process.env.AUTH_ACCOUNT;
  if (!authAccount) {
    fail('AUTH_ACCOUNT required');
  }
  if (process.env.CONFIRM !== 'DELETE_FA_KEY') {
    fail('Refusing to delete key without CONFIRM=DELETE_FA_KEY');
  }
  if (network === 'mainnet' && process.env.NEAR_REVIEWER_APPROVED !== '1') {
    fail(
      'Mainnet FA key deletion requires NEAR_REVIEWER_APPROVED=1 after reviewer sign-off'
    );
  }

  const credentialsRoot = path.join(os.homedir(), '.near-credentials');
  const nodeUrl =
    process.env.NEAR_RPC_URL ||
    (network === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
  const provider = new JsonRpcProvider({ url: nodeUrl });

  const accessKeys = await provider.query({
    request_type: 'view_access_key_list',
    account_id: authAccount,
    finality: 'final',
  });
  const faKeys = (accessKeys.keys || []).filter(
    (k) => k.access_key?.permission === 'FullAccess'
  );
  const faPubkeys = new Set(faKeys.map((k) => k.public_key));
  if (faKeys.length === 0) {
    console.log('No FullAccess keys on', authAccount);
    process.exit(0);
  }

  const keyPair = await loadFaKeyPair(network, authAccount, faPubkeys, credentialsRoot);
  if (!keyPair) {
    fail(`No local FullAccess private key for ${authAccount}`);
  }
  const publicKey = keyPair.getPublicKey().toString();
  console.log('Deleting FullAccess key', publicKey, 'from', authAccount);

  if (process.env.DRY_RUN === '1') {
    console.log('DRY RUN — would deleteAccessKey');
    process.exit(0);
  }

  const account = new Account(authAccount, provider, new KeyPairSigner(keyPair));
  const outcome = await account.deleteKey(publicKey);
  const txHash = outcome.transaction_outcome?.id || outcome.transaction?.hash;
  console.log('Tx:', txHash);
  if (outcome.status?.Failure) {
    fail(JSON.stringify(outcome.status.Failure));
  }

  const after = await provider.query({
    request_type: 'view_access_key_list',
    account_id: authAccount,
    finality: 'final',
  });
  const remainingFa = (after.keys || []).filter(
    (k) => k.access_key?.permission === 'FullAccess'
  );
  console.log('Remaining FullAccess keys:', remainingFa.length);
  console.log('✅ FA key deleted');
}

main().catch((err) => {
  console.error('❌ delete FA key failed:', err.message);
  process.exit(1);
});
