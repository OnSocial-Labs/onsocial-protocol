#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Account } from '@near-js/accounts';
import { UnencryptedFileSystemKeyStore } from '@near-js/keystores-node';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage(exitCode = 0) {
  const output = exitCode === 0 ? console.log : console.error;
  output(
    [
      'Usage:',
      '  node scripts/dao-proposal.mjs add --dao <dao-account> --signer <account> --file <proposal.json>',
      '  node scripts/dao-proposal.mjs vote-approve --dao <dao-account> --signer <account> --file <proposal.json> --id <proposal-id>',
      '',
      'Optional environment variables:',
      '  NETWORK=testnet|mainnet',
      '  NEAR_RPC_URL=<custom-rpc-url>',
    ].join('\n')
  );
  process.exit(exitCode);
}

function readOption(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    usage(0);
  }

  const options = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    switch (arg) {
      case '--dao':
        options.dao = readOption(rest, i, arg);
        i += 1;
        break;
      case '--signer':
        options.signer = readOption(rest, i, arg);
        i += 1;
        break;
      case '--file':
        options.file = readOption(rest, i, arg);
        i += 1;
        break;
      case '--id':
        options.id = readOption(rest, i, arg);
        i += 1;
        break;
      case '--help':
      case '-h':
        usage(0);
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseProposalFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Proposal file not found: ${absolutePath}`);
  }

  const proposal = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (!proposal.proposal || !proposal.proposal.kind) {
    fail(`Invalid proposal file: ${absolutePath}`);
  }
  return proposal;
}

async function getSignerAccount(network, signerId) {
  const credentialsPath = path.join(os.homedir(), '.near-credentials');
  const keyStore = new UnencryptedFileSystemKeyStore(credentialsPath);
  const keyPair = await keyStore.getKey(network, signerId);
  if (!keyPair) {
    fail(`No key found for ${signerId} in ${credentialsPath}/${network}`);
  }

  const nodeUrl = process.env.NEAR_RPC_URL
    || (network === 'mainnet'
      ? 'https://free.rpc.fastnear.com'
      : 'https://test.rpc.fastnear.com');
  const provider = new JsonRpcProvider({ url: nodeUrl });
  const signer = new KeyPairSigner(keyPair);
  return new Account(signerId, provider, signer);
}

async function addProposal(account, daoId, proposal) {
  return account.signAndSendTransaction({
    receiverId: daoId,
    actions: [
      {
        functionCall: {
          methodName: 'add_proposal',
          args: Buffer.from(JSON.stringify(proposal)),
          gas: BigInt('300000000000000'),
          deposit: BigInt('100000000000000000000000'),
        },
      },
    ],
  });
}

async function voteApprove(account, daoId, proposalId, proposal) {
  const args = {
    id: Number(proposalId),
    action: 'VoteApprove',
    proposal: proposal.proposal.kind,
  };

  return account.signAndSendTransaction({
    receiverId: daoId,
    actions: [
      {
        functionCall: {
          methodName: 'act_proposal',
          args: Buffer.from(JSON.stringify(args)),
          gas: BigInt('300000000000000'),
          deposit: BigInt(0),
        },
      },
    ],
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const network = process.env.NETWORK || 'testnet';

  if (!options.dao) {
    fail('Missing required --dao');
  }
  if (!options.signer) {
    fail('Missing required --signer');
  }
  if (!options.file) {
    fail('Missing required --file');
  }
  if (options.command === 'vote-approve' && !options.id) {
    fail('Missing required --id for vote-approve');
  }
  if (!['add', 'vote-approve'].includes(options.command)) {
    fail(`Unsupported command: ${options.command}`);
  }

  const proposal = parseProposalFile(options.file);
  const account = await getSignerAccount(network, options.signer);

  const result = options.command === 'add'
    ? await addProposal(account, options.dao, proposal)
    : await voteApprove(account, options.dao, options.id, proposal);

  console.log(JSON.stringify({
    final_execution_status: result.final_execution_status,
    transaction_outcome: result.transaction_outcome?.id || result.transaction?.hash,
    status: result.status,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});