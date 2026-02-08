/**
 * Contract upgrade script using @near-js packages (v2.5+)
 * Usage: node scripts/upgrade-contract.mjs <contract-name>
 * 
 * Requires: NETWORK, AUTH_ACCOUNT env vars
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Account } from '@near-js/accounts';
import { UnencryptedFileSystemKeyStore } from '@near-js/keystores-node';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const contractName = process.argv[2];
  if (!contractName) {
    console.error('Usage: node scripts/upgrade-contract.mjs <contract-name>');
    console.error('Example: node scripts/upgrade-contract.mjs staking-onsocial');
    process.exit(1);
  }

  const network = process.env.NETWORK || 'testnet';
  const authAccount = process.env.AUTH_ACCOUNT;
  
  if (!authAccount) {
    console.error('AUTH_ACCOUNT environment variable required');
    process.exit(1);
  }

  // Load contract config
  const configPath = path.join(__dirname, '..', 'configs', 'contracts.json');
  const contracts = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const contractConfig = contracts.find(c => c.name === contractName);
  
  if (!contractConfig) {
    console.error(`Contract '${contractName}' not found in configs/contracts.json`);
    process.exit(1);
  }

  // Resolve contract ID (expand env vars)
  let contractId = contractConfig.id;
  contractId = contractId.replace(/\$\{?(\w+)\}?/g, (_, name) => process.env[name] || '');
  
  console.log('Upgrading contract:', contractName);
  console.log('Contract ID:', contractId);
  console.log('Network:', network);
  console.log('Auth account:', authAccount);

  // Find WASM file
  const contractUnderscore = contractName.replace(/-/g, '_');
  const wasmPath = path.join(__dirname, '..', 'target', 'near', contractUnderscore, `${contractUnderscore}.wasm`);
  
  if (!fs.existsSync(wasmPath)) {
    console.error(`WASM not found: ${wasmPath}`);
    console.error(`Build first with: make build-contract-${contractName}`);
    process.exit(1);
  }

  const wasmBytes = fs.readFileSync(wasmPath);
  console.log('WASM size:', wasmBytes.length, 'bytes');

  // Setup NEAR connection
  const homedir = os.homedir();
  const credentialsPath = path.join(homedir, '.near-credentials');
  const keyStore = new UnencryptedFileSystemKeyStore(credentialsPath);
  
  const nodeUrl = process.env.NEAR_RPC_URL
    || (network === 'mainnet'
      ? 'https://near.lava.build'
      : 'https://neart.lava.build');
  
  const provider = new JsonRpcProvider({ url: nodeUrl });

  // Get the key for the auth account
  const keyPair = await keyStore.getKey(network, authAccount);
  if (!keyPair) {
    console.error(`No key found for ${authAccount} on ${network}`);
    console.error(`Check ~/.near-credentials/${network}/${authAccount}.json`);
    process.exit(1);
  }

  const signer = new KeyPairSigner(keyPair);
  const account = new Account(authAccount, provider, signer);

  console.log('');
  console.log('Calling update_contract on', contractId);
  console.log('This will deploy new code and call migrate()...');
  console.log('');

  // DRY_RUN mode - just show what would happen
  if (process.env.DRY_RUN === '1') {
    console.log('DRY RUN - Would execute:');
    console.log('  Contract:', contractId);
    console.log('  Method: update_contract');
    console.log('  WASM bytes:', wasmBytes.length);
    console.log('  Gas: 300 TGas');
    console.log('  Auth account:', authAccount);
    console.log('');
    console.log('To execute, run without DRY_RUN=1');
    process.exit(0);
  }

  // core-onsocial requires 1 yoctoNEAR deposit, staking-onsocial requires 0
  const deposit = contractName === 'core-onsocial' ? BigInt(1) : BigInt(0);
  console.log('Deposit:', deposit.toString(), 'yoctoNEAR');

  try {
    const outcome = await account.signAndSendTransaction({
      receiverId: contractId,
      actions: [{
        functionCall: {
          methodName: 'update_contract',
          args: wasmBytes,
          gas: BigInt('300000000000000'), // 300 TGas
          deposit,
        }
      }]
    });

    // Extract transaction hash
    const txHash = outcome.transaction_outcome?.id || outcome.transaction?.hash || 'see explorer';
    console.log('Transaction hash:', txHash);
    
    // Check final execution status
    const finalStatus = outcome.final_execution_status;
    if (finalStatus === 'EXECUTED' || finalStatus === 'FINAL') {
      console.log('✅ Contract upgraded successfully!');
    } else if (outcome.status?.Failure) {
      console.error('❌ Transaction failed:', JSON.stringify(outcome.status.Failure, null, 2));
      process.exit(1);
    } else {
      console.log('Status:', finalStatus || 'completed');
    }

    // Query new version — core uses get_version, staking uses get_stats
    console.log('');
    console.log('Querying contract version...');
    const versionMethod = contractName === 'core-onsocial' ? 'get_version' : 'get_stats';
    const viewResult = await provider.query({
      request_type: 'call_function',
      account_id: contractId,
      method_name: versionMethod,
      args_base64: Buffer.from(JSON.stringify({})).toString('base64'),
      finality: 'final',
    });

    const result = JSON.parse(Buffer.from(viewResult.result).toString());
    const version = typeof result === 'string' ? result : result.version;
    console.log('New version:', version);

  } catch (error) {
    console.error('❌ Upgrade failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause.message || error.cause);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
