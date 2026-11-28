#!/usr/bin/env node
/**
 * Create a disposable Sputnik DAO subaccount for self-upgrade proofs.
 *
 * Usage:
 *   NETWORK=testnet node scripts/deploy-dao-scratch.mjs \
 *     --dao dao-self-tre.onsocial.testnet \
 *     --master onsocial.testnet \
 *     --init-file deployment/governance-dao/scratch-treasury.init.testnet.json
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Account } from '@near-js/accounts';
import { KeyPair } from '@near-js/crypto';
import { UnencryptedFileSystemKeyStore } from '@near-js/keystores-node';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    network: process.env.NETWORK || 'testnet',
    createBalanceNear: '8',
    skipCreate: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--network':
        options.network = argv[++i];
        break;
      case '--dao':
        options.dao = argv[++i];
        break;
      case '--master':
        options.master = argv[++i];
        break;
      case '--init-file':
        options.initFile = argv[++i];
        break;
      case '--wasm':
        options.wasm = argv[++i];
        break;
      case '--create-balance':
        options.createBalanceNear = argv[++i];
        break;
      case '--skip-create':
        options.skipCreate = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }
  if (!options.dao || !options.master || !options.initFile) {
    fail('Required: --dao --master --init-file');
  }
  return options;
}

function nearToYocto(amount) {
  const [whole, fraction = ''] = String(amount).split('.');
  const padded = `${fraction}000000000000000000000000`.slice(0, 24);
  return BigInt(`${whole}${padded}`);
}

async function accountExists(provider, accountId) {
  try {
    await provider.query({
      request_type: 'view_account',
      account_id: accountId,
      finality: 'final',
    });
    return true;
  } catch {
    return false;
  }
}

async function getAccount(network, accountId, keyStore, provider) {
  const keyPair = await keyStore.getKey(network, accountId);
  if (!keyPair) {
    fail(`No key for ${accountId} in ~/.near-credentials/${network}`);
  }
  return new Account(accountId, provider, new KeyPairSigner(keyPair));
}

function saveCredentials(network, accountId, keyPair) {
  const credPath = path.join(
    os.homedir(),
    '.near-credentials',
    network,
    `${accountId}.json`
  );
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(
    credPath,
    `${JSON.stringify(
      {
        account_id: accountId,
        public_key: keyPair.getPublicKey().toString(),
        private_key: keyPair.toString(),
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
  console.log(`Saved credentials: ${credPath}`);
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
  const options = parseArgs(process.argv.slice(2));
  const initPath = path.resolve(REPO_ROOT, options.initFile);
  if (!fs.existsSync(initPath)) {
    fail(`Init file not found: ${initPath}`);
  }
  const initArgs = JSON.parse(fs.readFileSync(initPath, 'utf8'));

  const wasmPath = path.resolve(
    REPO_ROOT,
    options.wasm || 'deployment/governance-dao/artifacts/sputnikdao2.wasm'
  );
  if (!fs.existsSync(wasmPath)) {
    fail(`Missing ${wasmPath}; run prepare_sputnik_dao_artifacts.sh`);
  }
  const wasmBytes = fs.readFileSync(wasmPath);

  const nodeUrl =
    process.env.NEAR_RPC_URL ||
    (options.network === 'mainnet'
      ? 'https://free.rpc.fastnear.com'
      : 'https://test.rpc.fastnear.com');
  const provider = new JsonRpcProvider({ url: nodeUrl });
  const keyStore = new UnencryptedFileSystemKeyStore(
    path.join(os.homedir(), '.near-credentials')
  );

  const exists = await accountExists(provider, options.dao);
  let daoKeyPair = await keyStore.getKey(options.network, options.dao);

  if (!exists && !options.skipCreate) {
    console.log(`Creating ${options.dao} from ${options.master}`);
    daoKeyPair = KeyPair.fromRandom('ed25519');
    const master = await getAccount(
      options.network,
      options.master,
      keyStore,
      provider
    );
    await master.createAccount(
      options.dao,
      daoKeyPair.getPublicKey(),
      nearToYocto(options.createBalanceNear)
    );
    saveCredentials(options.network, options.dao, daoKeyPair);
  } else if (!daoKeyPair) {
    fail(`Account exists but no local key for ${options.dao}`);
  } else {
    console.log(`Using existing account ${options.dao}`);
  }

  const dao = await getAccount(options.network, options.dao, keyStore, provider);

  console.log('Deploying wasm...');
  const deployOutcome = await dao.signAndSendTransaction({
    receiverId: options.dao,
    actions: [{ deployContract: { code: wasmBytes } }],
  });
  if (deployOutcome.status?.Failure) {
    fail(`Deploy failed: ${JSON.stringify(deployOutcome.status.Failure)}`);
  }

  let alreadyInit = false;
  try {
    await viewJson(provider, options.dao, 'get_config');
    alreadyInit = true;
  } catch {
    alreadyInit = false;
  }

  if (alreadyInit) {
    console.log('Contract already initialized; calling migrate only');
    const migrateOutcome = await dao.signAndSendTransaction({
      receiverId: options.dao,
      actions: [
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
    if (migrateOutcome.status?.Failure) {
      fail(`migrate failed: ${JSON.stringify(migrateOutcome.status.Failure)}`);
    }
  } else {
    console.log('Calling new...');
    const newOutcome = await dao.signAndSendTransaction({
      receiverId: options.dao,
      actions: [
        {
          functionCall: {
            methodName: 'new',
            args: Buffer.from(JSON.stringify(initArgs)),
            gas: BigInt('100000000000000'),
            deposit: BigInt(0),
          },
        },
      ],
    });
    if (newOutcome.status?.Failure) {
      fail(`new failed: ${JSON.stringify(newOutcome.status.Failure)}`);
    }
  }

  // Finality can lag optimistic views right after init.
  let version = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      version = await viewJson(provider, options.dao, 'version');
      break;
    } catch (err) {
      await new Promise((r) => setTimeout(r, 1000));
      if (attempt === 7) throw err;
    }
  }
  console.log('version:', version);
  console.log('✅ Scratch DAO ready:', options.dao);
}

main().catch((err) => {
  console.error('❌ deploy-dao-scratch failed:', err.message);
  if (err.cause) console.error('Cause:', err.cause.message || err.cause);
  process.exit(1);
});
