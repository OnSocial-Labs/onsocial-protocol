#!/usr/bin/env node
/**
 * Emit (and optionally submit) treasury DAO add-liquidity proposals for Rhea pools.
 *
 * Usage:
 *   node scripts/treasury-lp-proposals.mjs emit --pool 6783 --social 0.05
 *   node scripts/treasury-lp-proposals.mjs emit --pool 6783 --social-yocto 5e22 --pair-yocto ...
 *
 * Optional:
 *   --out-dir deployment/governance-dao
 *   --slippage-bps 50
 *   --no-wrap          (6783 only; assume wNEAR already in treasury wallet)
 *   --fetch-pool       read mainnet reserves to size the pair side
 *
 * Preconditions (mainnet views, no txs):
 *   node scripts/treasury-lp-proposals.mjs check --pool 6783 --social 0.05 --dao treasury.onsocial.near
 *
 * Submit (council signer must exist in ~/.near-credentials):
 *   NETWORK=mainnet node scripts/treasury-lp-proposals.mjs add \
 *     --dao treasury.onsocial.near --signer onsocial.near --pool 6783 --social 0.05
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  NEAR_SPEND_BUFFER_YOCTO,
  RHEA_REF_CONTRACT,
  SOCIAL_DECIMALS,
  SOCIAL_TOKEN_ID,
  TREASURY_LP_POOLS,
  USDC_TOKEN_ID,
  WNEAR_TOKEN_ID,
  buildTreasuryAddLiquidityProposals,
  matchPairAmount,
  spendableNearYocto,
} from './lib/treasury-lp-proposals.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MAINNET_RPC =
  process.env.NEAR_RPC_URL || 'https://free.rpc.fastnear.com';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage(code = 0) {
  const out = code === 0 ? console.log : console.error;
  out(`Usage:
  node scripts/treasury-lp-proposals.mjs check --pool 6783|6771 --pair 1 --dao treasury.onsocial.near --signer onsocial.near
  node scripts/treasury-lp-proposals.mjs emit --pool 6783|6771 --social <human>
  node scripts/treasury-lp-proposals.mjs emit --pool 6783 --social-yocto <n> --pair-yocto <n>
  node scripts/treasury-lp-proposals.mjs add --dao <dao> --signer <account> --pool 6783 --pair 1

Options:
  --out-dir <dir>     default: deployment/governance-dao
  --slippage-bps <n>  default: 50 (0.5%)
  --no-wrap           skip near_deposit (wNEAR already held)
  --fetch-pool        size pair side from live mainnet reserves
  --pair <human>      pair human amount (NEAR for 6783, USDC for 6771)
  --pair-yocto <n>
  --signer <account>  council proposer (required for check bond cover)
  --step <1|2|3|all>  add only one proposal step (default all)
`);
  process.exit(code);
}

function readOption(argv, i, flag) {
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) fail(`Missing value for ${flag}`);
  return value;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') usage(0);
  const options = {
    command,
    pool: null,
    social: null,
    socialYocto: null,
    pair: null,
    pairYocto: null,
    outDir: path.join(REPO_ROOT, 'deployment/governance-dao'),
    slippageBps: 50,
    wrapNear: true,
    fetchPool: false,
    dao: 'treasury.onsocial.near',
    signer: null,
    step: 'all',
  };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    switch (arg) {
      case '--pool':
        options.pool = Number(readOption(rest, i, arg));
        i += 1;
        break;
      case '--social':
        options.social = readOption(rest, i, arg);
        i += 1;
        break;
      case '--social-yocto':
        options.socialYocto = readOption(rest, i, arg);
        i += 1;
        break;
      case '--pair':
        options.pair = readOption(rest, i, arg);
        i += 1;
        break;
      case '--pair-yocto':
        options.pairYocto = readOption(rest, i, arg);
        i += 1;
        break;
      case '--out-dir':
        options.outDir = path.resolve(readOption(rest, i, arg));
        i += 1;
        break;
      case '--slippage-bps':
        options.slippageBps = Number(readOption(rest, i, arg));
        i += 1;
        break;
      case '--no-wrap':
        options.wrapNear = false;
        break;
      case '--fetch-pool':
        options.fetchPool = true;
        break;
      case '--dao':
        options.dao = readOption(rest, i, arg);
        i += 1;
        break;
      case '--signer':
        options.signer = readOption(rest, i, arg);
        i += 1;
        break;
      case '--step':
        options.step = readOption(rest, i, arg);
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

async function rpcQuery(params) {
  const res = await fetch(MAINNET_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'treasury-lp-check',
      method: 'query',
      params,
    }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(JSON.stringify(body.error));
  }
  return body.result;
}

async function viewCall(accountId, methodName, args = {}) {
  const result = await rpcQuery({
    request_type: 'call_function',
    finality: 'final',
    account_id: accountId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  if (!result?.result) {
    throw new Error(`view ${accountId}.${methodName} failed`);
  }
  const raw = Buffer.from(result.result).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function decodeArgs(b64) {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function check(label, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

/** Human decimal → smallest-unit string (SOCIAL=18, wNEAR=24, USDC=6). */
function humanToYocto(human, decimals) {
  const raw = String(human).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    fail(`Invalid human amount: ${human}`);
  }
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > decimals) {
    fail(`Too many decimal places for ${decimals}-decimal token: ${human}`);
  }
  const padded = frac.padEnd(decimals, '0');
  const yocto = `${whole}${padded}`.replace(/^0+(?=\d)/, '');
  return yocto === '' ? '0' : yocto;
}

function yoctoToHuman(yocto, decimals) {
  const raw = String(yocto).replace(/^0+(?=\d)/, '') || '0';
  if (decimals === 0) return raw;
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

async function fetchPoolReserves(poolId) {
  return viewCall(RHEA_REF_CONTRACT, 'get_pool', { pool_id: poolId });
}

async function resolveAmounts(options) {
  const pool = TREASURY_LP_POOLS[options.pool];
  if (!pool) fail(`Unsupported --pool ${options.pool}`);

  const pairDecimals = pool.pairDecimals;
  let socialYocto = options.socialYocto;
  if (socialYocto) {
    // keep
  } else if (options.social) {
    socialYocto = humanToYocto(options.social, SOCIAL_DECIMALS);
  }

  let pairYocto = options.pairYocto;
  if (!pairYocto && options.pair) {
    pairYocto = humanToYocto(options.pair, pairDecimals);
  }

  // Size the missing side from live reserves (amounts already in token decimals).
  if (!socialYocto || !pairYocto) {
    if (!options.fetchPool && (!options.pair || !options.social)) {
      options.fetchPool = true;
    }
    if (!options.fetchPool) {
      fail(
        'Provide both sides (--social/--pair or yocto) or --fetch-pool to size the missing side'
      );
    }
    const reserves = await fetchPoolReserves(options.pool);
    const [poolSocial, poolPair] = reserves.amounts;
    if (socialYocto && !pairYocto) {
      pairYocto = matchPairAmount({
        socialAmountYocto: socialYocto,
        poolSocialYocto: poolSocial,
        poolPairYocto: poolPair,
      });
      console.log(
        `Sized pair from pool ${options.pool}: ${yoctoToHuman(pairYocto, pairDecimals)} (${pairYocto})`
      );
    } else if (pairYocto && !socialYocto) {
      // Invert matchPairAmount: social = pair * poolSocial / poolPair
      socialYocto = matchPairAmount({
        socialAmountYocto: pairYocto,
        poolSocialYocto: poolPair,
        poolPairYocto: poolSocial,
      });
      console.log(
        `Sized SOCIAL from pool ${options.pool}: ${yoctoToHuman(socialYocto, SOCIAL_DECIMALS)} SOCIAL (${socialYocto})`
      );
    } else {
      fail('Provide --social/--social-yocto or --pair/--pair-yocto');
    }
  }

  console.log(
    `Amounts: ${yoctoToHuman(socialYocto, SOCIAL_DECIMALS)} SOCIAL + ${yoctoToHuman(pairYocto, pairDecimals)} ${pool.pair}`
  );
  return { socialYocto, pairYocto, pool };
}

function writeProposals(outDir, built) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const step of built.proposals) {
    const filePath = path.join(outDir, step.fileHint);
    fs.writeFileSync(filePath, `${JSON.stringify(step.payload, null, 2)}\n`);
    written.push(filePath);
    console.log(`Wrote ${filePath}`);
  }
  return written;
}

function selectStepFiles(built, files, step) {
  if (step === 'all') return files;
  const index = Number(step) - 1;
  if (![0, 1, 2].includes(index)) {
    fail(`--step must be 1, 2, 3, or all (got ${step})`);
  }
  return [files[index]];
}

async function runCheck(options, built) {
  const dao = options.dao;
  const pool = TREASURY_LP_POOLS[built.poolId];
  let failed = 0;
  const requireOk = (label, ok, detail) => {
    if (!check(label, ok, detail)) failed += 1;
  };

  console.log(`\nChecking treasury LP preconditions on mainnet (${MAINNET_RPC})`);
  console.log(
    `dao=${dao} pool=${built.poolId} social=${yoctoToHuman(built.socialAmountYocto, SOCIAL_DECIMALS)} SOCIAL (${built.socialAmountYocto}) pair=${yoctoToHuman(built.pairAmountYocto, pool.pairDecimals)} ${pool.pair} (${built.pairAmountYocto})`
  );

  const account = await rpcQuery({
    request_type: 'view_account',
    finality: 'final',
    account_id: dao,
  });
  const daoFreeNear = spendableNearYocto(account);
  requireOk(
    'treasury account exists',
    Boolean(account.code_hash),
    `amount=${account.amount} free=${daoFreeNear} storage_usage=${account.storage_usage}`
  );

  const policy = await viewCall(dao, 'get_policy', {});
  const bond = BigInt(policy.proposal_bond || '0');
  requireOk('proposal_bond readable', bond > 0n, bond.toString());

  if (!options.signer) {
    fail('check requires --signer <council> to verify proposal-bond cover');
  }
  const signerAccount = await rpcQuery({
    request_type: 'view_account',
    finality: 'final',
    account_id: options.signer,
  });
  const signerFreeNear = spendableNearYocto(signerAccount);
  // Three add_proposal bonds (one per step); votes attach 0 deposit.
  const bondNeed = bond * 3n + NEAR_SPEND_BUFFER_YOCTO;
  requireOk(
    'proposer free NEAR covers 3× proposal bonds',
    signerFreeNear >= bondNeed,
    `${options.signer} free=${signerFreeNear} need=${bondNeed}`
  );

  const socialBal = BigInt(
    await viewCall(SOCIAL_TOKEN_ID, 'ft_balance_of', { account_id: dao })
  );
  requireOk(
    'SOCIAL wallet covers deposit',
    socialBal >= BigInt(built.socialAmountYocto),
    `${socialBal} >= ${built.socialAmountYocto}`
  );

  if (pool.pair === 'wnear' && options.wrapNear) {
    // near_deposit spends free NEAR only — storage stake is not spendable.
    const wrapNeed = BigInt(built.pairAmountYocto) + NEAR_SPEND_BUFFER_YOCTO;
    requireOk(
      'treasury free NEAR covers near_deposit',
      daoFreeNear >= wrapNeed,
      `free=${daoFreeNear} need=${wrapNeed} (pair+${NEAR_SPEND_BUFFER_YOCTO} buffer)`
    );
  } else if (pool.pair === 'usdc') {
    const usdcBal = BigInt(
      await viewCall(USDC_TOKEN_ID, 'ft_balance_of', { account_id: dao })
    );
    requireOk(
      'USDC wallet covers deposit',
      usdcBal >= BigInt(built.pairAmountYocto),
      `${usdcBal} >= ${built.pairAmountYocto}`
    );
  } else {
    const wnearBal = BigInt(
      await viewCall(WNEAR_TOKEN_ID, 'ft_balance_of', { account_id: dao })
    );
    requireOk(
      'wNEAR wallet covers deposit (--no-wrap)',
      wnearBal >= BigInt(built.pairAmountYocto),
      `${wnearBal} >= ${built.pairAmountYocto}`
    );
  }

  const refStorage = await viewCall(RHEA_REF_CONTRACT, 'storage_balance_of', {
    account_id: dao,
  });
  requireOk(
    'Ref storage registered',
    Boolean(refStorage && refStorage.total),
    JSON.stringify(refStorage)
  );

  const mft = await viewCall(RHEA_REF_CONTRACT, 'mft_has_registered', {
    token_id: `:${built.poolId}`,
    account_id: dao,
  });
  requireOk(`MFT registered for :${built.poolId}`, mft === true, String(mft));

  const reserves = await fetchPoolReserves(built.poolId);
  requireOk(
    'pool token order is SOCIAL then pair',
    reserves.token_account_ids?.[0] === SOCIAL_TOKEN_ID &&
      reserves.token_account_ids?.[1] === pool.tokenIds[1],
    JSON.stringify(reserves.token_account_ids)
  );

  // Decode proposal payloads
  for (const step of built.proposals) {
    const fc = step.payload.proposal.kind.FunctionCall;
    requireOk(
      `${step.id} has FunctionCall receiver`,
      typeof fc.receiver_id === 'string' && fc.actions?.length > 0,
      fc.receiver_id
    );
    for (const action of fc.actions) {
      const args = decodeArgs(action.args);
      requireOk(
        `${step.id}.${action.method_name} args decode`,
        args != null,
        JSON.stringify(args)
      );
      if (action.method_name === 'ft_transfer_call') {
        requireOk(
          `${step.id} ft_transfer_call → Ref`,
          args.receiver_id === RHEA_REF_CONTRACT && args.msg === '',
          JSON.stringify(args)
        );
      }
      if (action.method_name === 'add_liquidity') {
        requireOk(
          `${step.id} add_liquidity pool/amounts`,
          args.pool_id === built.poolId &&
            args.amounts?.[0] === built.socialAmountYocto &&
            args.amounts?.[1] === built.pairAmountYocto,
          JSON.stringify(args)
        );
      }
    }
    const actionGas = fc.actions.reduce(
      (sum, action) => sum + BigInt(action.gas),
      0n
    );
    requireOk(
      `${step.id} action gas fits 300 TGas receipt`,
      actionGas <= 280_000_000_000_000n,
      actionGas.toString()
    );
  }

  const sharesBefore = await viewCall(RHEA_REF_CONTRACT, 'mft_balance_of', {
    token_id: `:${built.poolId}`,
    account_id: dao,
  });
  console.log(`INFO  treasury LP shares :${built.poolId} = ${sharesBefore}`);

  if (failed > 0) {
    fail(`check failed (${failed} assertion(s))`);
  }
  console.log('\nAll checks passed. Safe to add proposals one step at a time.');
}

async function runAdd(options, files) {
  const { spawnSync } = await import('node:child_process');
  if (!options.dao || !options.signer) {
    fail('add requires --dao and --signer');
  }
  for (const file of files) {
    console.log(`\nAdding proposal from ${file}`);
    const result = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'scripts/dao-proposal.mjs'),
        'add',
        '--dao',
        options.dao,
        '--signer',
        options.signer,
        '--file',
        file,
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, NETWORK: process.env.NETWORK || 'mainnet' },
      }
    );
    if (result.status !== 0) {
      fail(`dao-proposal add failed for ${file} (exit ${result.status})`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!['emit', 'add', 'check'].includes(options.command)) {
    fail(`Unknown command: ${options.command}`);
  }
  if (!options.pool) fail('--pool is required');

  const { socialYocto, pairYocto } = await resolveAmounts(options);
  const built = buildTreasuryAddLiquidityProposals({
    poolId: options.pool,
    socialAmountYocto: socialYocto,
    pairAmountYocto: pairYocto,
    slippageBps: options.slippageBps,
    wrapNear: options.wrapNear,
  });

  console.log(
    JSON.stringify(
      {
        poolId: built.poolId,
        label: built.label,
        socialAmountYocto: built.socialAmountYocto,
        pairAmountYocto: built.pairAmountYocto,
        minAmounts: built.minAmounts,
        steps: built.proposals.map((p) => p.id),
      },
      null,
      2
    )
  );

  if (options.command === 'check') {
    await runCheck(options, built);
    return;
  }

  const files = writeProposals(options.outDir, built);
  const selected = selectStepFiles(built, files, options.step);
  if (options.command === 'add') {
    await runAdd(options, selected);
  } else {
    console.log(
      '\nNext: run check, then add+vote one step at a time:\n' +
        `  node scripts/treasury-lp-proposals.mjs check --pool ${options.pool} --social ${options.social || built.socialAmountYocto} --dao ${options.dao}\n` +
        `  NETWORK=mainnet node scripts/treasury-lp-proposals.mjs add --step 1 --dao ${options.dao} --signer onsocial.near --pool ${options.pool} --social ${options.social || '0.05'}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
