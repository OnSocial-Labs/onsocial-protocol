#!/usr/bin/env node
/**
 * Non-interactive deploy for Sputnik DAO staking (sputnik_staking.wasm).
 *
 * Usage:
 *   node scripts/deploy-sputnik-dao-staking.mjs \
 *     --network testnet \
 *     --staking-account staking-treasury.onsocial.testnet \
 *     --master-account onsocial.testnet \
 *     --init-file deployment/governance-dao/staking-treasury.init.testnet.json
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
    createBalanceNear: '5',
    skipCreate: false,
    skipDeploy: false,
    skipTokenRegister: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--network':
        options.network = argv[++i];
        break;
      case '--staking-account':
        options.stakingAccount = argv[++i];
        break;
      case '--owner-id':
        options.ownerId = argv[++i];
        break;
      case '--master-account':
        options.masterAccount = argv[++i];
        break;
      case '--init-file':
        options.initFile = argv[++i];
        break;
      case '--token-account':
        options.tokenAccount = argv[++i];
        break;
      case '--funding-account':
        options.fundingAccount = argv[++i];
        break;
      case '--create-balance':
        options.createBalanceNear = argv[++i];
        break;
      case '--skip-create':
        options.skipCreate = true;
        break;
      case '--skip-deploy':
        options.skipDeploy = true;
        break;
      case '--skip-token-register':
        options.skipTokenRegister = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  if (!options.stakingAccount || !options.masterAccount || !options.initFile) {
    fail(
      'Required: --staking-account --master-account --init-file (optional: --owner-id --token-account --funding-account)'
    );
  }

  options.fundingAccount = options.fundingAccount || options.masterAccount;
  options.tokenAccount =
    options.tokenAccount ||
    (options.network === 'mainnet'
      ? 'token.onsocial.near'
      : 'token.onsocial.testnet');

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
    fail(
      `No key for ${accountId} in ~/.near-credentials/${network}/${accountId}.json`
    );
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const initPath = path.resolve(REPO_ROOT, options.initFile);
  if (!fs.existsSync(initPath)) {
    fail(`Init file not found: ${initPath}`);
  }

  const initArgs = JSON.parse(fs.readFileSync(initPath, 'utf8'));
  options.ownerId = options.ownerId || initArgs.owner_id;
  if (!options.ownerId) {
    fail('owner_id missing from init file; pass --owner-id');
  }

  const wasmPath = path.join(
    REPO_ROOT,
    'deployment/governance-dao/artifacts/sputnik_staking.wasm'
  );
  if (!fs.existsSync(wasmPath)) {
    fail(`Missing ${wasmPath}; run scripts/prepare_sputnik_dao_artifacts.sh`);
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

  const exists = await accountExists(provider, options.stakingAccount);
  let stakingKeyPair = await keyStore.getKey(
    options.network,
    options.stakingAccount
  );

  if (!exists && !options.skipCreate) {
    console.log(`Creating ${options.stakingAccount} from ${options.masterAccount}`);
    stakingKeyPair = KeyPair.fromRandom('ed25519');
    const master = await getAccount(
      options.network,
      options.masterAccount,
      keyStore,
      provider
    );
    const outcome = await master.createAccount(
      options.stakingAccount,
      stakingKeyPair.getPublicKey(),
      nearToYocto(options.createBalanceNear)
    );
    console.log('Create tx:', outcome.transaction_outcome?.id);
    await keyStore.setKey(
      options.network,
      options.stakingAccount,
      stakingKeyPair
    );
    saveCredentials(options.network, options.stakingAccount, stakingKeyPair);
  } else if (exists) {
    console.log(`Account exists: ${options.stakingAccount}`);
    if (!stakingKeyPair) {
      fail(
        `Account exists but no local key for ${options.stakingAccount}; add credentials or use --skip-create with key present`
      );
    }
  } else {
    fail('Account missing and --skip-create set');
  }

  const stakingAccount = new Account(
    options.stakingAccount,
    provider,
    new KeyPairSigner(stakingKeyPair)
  );

  if (!options.skipDeploy) {
    console.log(`Deploying sputnik_staking.wasm to ${options.stakingAccount}`);
    const deployOutcome = await stakingAccount.signAndSendTransaction({
      receiverId: options.stakingAccount,
      actions: [
        {
          deployContract: {
            code: wasmBytes,
          },
        },
      ],
    });
    console.log('Deploy tx:', deployOutcome.transaction_outcome?.id);
    console.log('Deploy status:', deployOutcome.status);

    const initOutcome = await stakingAccount.signAndSendTransaction({
      receiverId: options.stakingAccount,
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
    console.log('Init tx:', initOutcome.transaction_outcome?.id);
    console.log('Init status:', initOutcome.status);
  } else {
    console.log('Skipping deploy/init (--skip-deploy)');
  }

  if (!options.skipTokenRegister) {
    const funder = await getAccount(
      options.network,
      options.fundingAccount,
      keyStore,
      provider
    );
    console.log(
      `Registering ${options.stakingAccount} on ${options.tokenAccount}`
    );
    const registerOutcome = await funder.signAndSendTransaction({
      receiverId: options.tokenAccount,
      actions: [
        {
          functionCall: {
            methodName: 'storage_deposit',
            args: Buffer.from(
              JSON.stringify({
                account_id: options.stakingAccount,
                registration_only: true,
              })
            ),
            gas: BigInt('30000000000000'),
            deposit: BigInt('125000000000000000000000'),
          },
        },
      ],
    });
    console.log('Register tx:', registerOutcome.transaction_outcome?.id);
  }

  console.log('\nDone. Next: submit SetStakingContract + delegated_proposers DAO proposals.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
