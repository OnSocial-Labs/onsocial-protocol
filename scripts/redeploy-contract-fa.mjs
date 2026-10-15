/**
 * Redeploy contract code via account FullAccess key (bypasses owner update_contract).
 * One tx: DeployContract + migrate.
 *
 * Usage: NETWORK=testnet AUTH_ACCOUNT=rewards.onsocial.testnet \
 *   node scripts/redeploy-contract-fa.mjs rewards-onsocial
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Account } from '@near-js/accounts';
import { UnencryptedFileSystemKeyStore } from '@near-js/keystores-node';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const contractName = process.argv[2];
  if (!contractName) {
    console.error('Usage: node scripts/redeploy-contract-fa.mjs <contract-name>');
    process.exit(1);
  }

  const network = process.env.NETWORK || 'testnet';
  const authAccount = process.env.AUTH_ACCOUNT;
  if (!authAccount) {
    console.error('AUTH_ACCOUNT required (must be the contract account with FA key)');
    process.exit(1);
  }

  const configPath = path.join(__dirname, '..', 'configs', 'contracts.json');
  const contracts = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const contractConfig = contracts.find((c) => c.name === contractName);
  if (!contractConfig) {
    console.error(`Contract '${contractName}' not found in configs/contracts.json`);
    process.exit(1);
  }

  let contractId = process.env.CONTRACT_ID || contractConfig.id;
  contractId = contractId.replace(/\$\{?(\w+)\}?/g, (_, name) => process.env[name] || '');

  if (contractId !== authAccount) {
    console.error(
      `AUTH_ACCOUNT (${authAccount}) must equal contract account (${contractId}) for FA redeploy`
    );
    process.exit(1);
  }

  const contractUnderscore = contractName.replace(/-/g, '_');
  const wasmPath =
    process.env.WASM_PATH ||
    path.join(__dirname, '..', 'target', 'near', contractUnderscore, `${contractUnderscore}.wasm`);
  if (!fs.existsSync(wasmPath)) {
    console.error(`WASM not found: ${wasmPath}`);
    process.exit(1);
  }
  const wasmBytes = fs.readFileSync(wasmPath);

  console.log('FA redeploy:', contractName);
  console.log('Contract / signer:', contractId);
  console.log('Network:', network);
  console.log('WASM size:', wasmBytes.length);

  const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), '.near-credentials'));
  const nodeUrl =
    process.env.NEAR_RPC_URL ||
    (network === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com');
  const provider = new JsonRpcProvider({ url: nodeUrl });
  const keyPair = await keyStore.getKey(network, authAccount);
  if (!keyPair) {
    console.error(`No key for ${authAccount} on ${network}`);
    process.exit(1);
  }
  console.log('Signing with:', keyPair.getPublicKey().toString());

  if (process.env.DRY_RUN === '1') {
    console.log('DRY RUN — would DeployContract + migrate');
    process.exit(0);
  }

  const account = new Account(authAccount, provider, new KeyPairSigner(keyPair));
  const outcome = await account.signAndSendTransaction({
    receiverId: contractId,
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
  console.log('Final status:', outcome.final_execution_status);
  if (outcome.status?.Failure) {
    console.error('Failure:', JSON.stringify(outcome.status.Failure, null, 2));
    process.exit(1);
  }

  const view = await provider.query({
    request_type: 'call_function',
    account_id: contractId,
    method_name: 'get_contract_info',
    args_base64: Buffer.from('{}').toString('base64'),
    finality: 'optimistic',
  });
  const info = JSON.parse(Buffer.from(view.result).toString());
  console.log('version:', info.version);
  console.log('owner_id:', info.owner_id);
  console.log('pool_balance:', info.pool_balance);
  console.log('✅ FA redeploy complete');
}

main().catch((err) => {
  console.error('❌ Redeploy failed:', err.message);
  if (err.cause) console.error('Cause:', err.cause.message || err.cause);
  process.exit(1);
});
