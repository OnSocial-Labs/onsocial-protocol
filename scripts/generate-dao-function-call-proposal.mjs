#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage(exitCode = 0) {
  const text = [
    'Usage:',
    '  node scripts/generate-dao-function-call-proposal.mjs \\',
    '    --description "..." \\',
    '    --receiver <account-id> \\',
    '    --method <method-name> \\',
    '    [--json-args <json-string> | --bytes-file <path>] \\',
    '    [--deposit <yoctoNEAR>] \\',
    '    [--gas <gas-units>] \\',
    '    [--output <path>]',
    '',
    'Examples:',
    '  node scripts/generate-dao-function-call-proposal.mjs \\',
    '    --description "Transfer rewards ownership to governance DAO" \\',
    '    --receiver rewards.onsocial.testnet \\',
    '    --method transfer_ownership \\',
    '    --json-args "{\"new_owner\":\"governance.onsocial.testnet\"}"',
    '',
    '  node scripts/generate-dao-function-call-proposal.mjs \\',
    '    --description "Upgrade rewards contract" \\',
    '    --receiver rewards.onsocial.testnet \\',
    '    --method update_contract \\',
    '    --bytes-file target/near/rewards_onsocial/rewards_onsocial.wasm',
    '',
    '  node scripts/generate-dao-function-call-proposal.mjs \\',
    '    --description "Upgrade rewards contract by published code hash" \\',
    '    --receiver rewards.onsocial.testnet \\',
    '    --method update_contract_from_hash \\',
    '    --json-args "{\"code_hash\":\"BfQpDZmoANEY44BS7xjLuWVHBPpefcpbj9mbiMxcnMHR\"}"',
  ].join('\n');

  const out = exitCode === 0 ? console.log : console.error;
  out(text);
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
  const options = {
    deposit: '0',
    gas: '300000000000000',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        usage(0);
        break;
      case '--description':
        options.description = readOption(argv, i, arg);
        i += 1;
        break;
      case '--receiver':
        options.receiver = readOption(argv, i, arg);
        i += 1;
        break;
      case '--method':
        options.method = readOption(argv, i, arg);
        i += 1;
        break;
      case '--json-args':
        options.jsonArgs = readOption(argv, i, arg);
        i += 1;
        break;
      case '--bytes-file':
        options.bytesFile = readOption(argv, i, arg);
        i += 1;
        break;
      case '--deposit':
        options.deposit = readOption(argv, i, arg);
        i += 1;
        break;
      case '--gas':
        options.gas = readOption(argv, i, arg);
        i += 1;
        break;
      case '--output':
        options.output = readOption(argv, i, arg);
        i += 1;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function validateUnsignedInteger(value, fieldName) {
  if (!/^\d+$/.test(value)) {
    fail(`${fieldName} must be an unsigned integer string`);
  }
}

function buildArgsBase64(options) {
  if (options.jsonArgs && options.bytesFile) {
    fail('Use either --json-args or --bytes-file, not both');
  }

  if (!options.jsonArgs && !options.bytesFile) {
    return '';
  }

  if (options.jsonArgs) {
    try {
      JSON.parse(options.jsonArgs);
    } catch (error) {
      fail(`Invalid JSON for --json-args: ${error.message}`);
    }
    return Buffer.from(options.jsonArgs, 'utf8').toString('base64');
  }

  const filePath = path.resolve(process.cwd(), options.bytesFile);
  if (!fs.existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
  }

  return fs.readFileSync(filePath).toString('base64');
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.description) {
    fail('Missing required --description');
  }
  if (!options.receiver) {
    fail('Missing required --receiver');
  }
  if (!options.method) {
    fail('Missing required --method');
  }

  validateUnsignedInteger(options.deposit, '--deposit');
  validateUnsignedInteger(options.gas, '--gas');

  const gasValue = Number(options.gas);
  if (!Number.isSafeInteger(gasValue)) {
    fail('--gas exceeds JavaScript safe integer range');
  }

  const proposal = {
    proposal: {
      description: options.description,
      kind: {
        FunctionCall: {
          receiver_id: options.receiver,
          actions: [
            {
              method_name: options.method,
              args: buildArgsBase64(options),
              deposit: options.deposit,
              gas: gasValue,
            },
          ],
        },
      },
    },
  };

  const content = `${JSON.stringify(proposal, null, 2)}\n`;

  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf8');
    console.error(`Wrote proposal payload to ${outputPath}`);
    return;
  }

  process.stdout.write(content);
}

main();