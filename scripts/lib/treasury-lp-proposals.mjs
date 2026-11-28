/**
 * Treasury DAO → Rhea/Ref simple-pool add-liquidity proposal builders.
 *
 * One Sputnik FunctionCall = one receiver, so a full add is three proposals:
 * 1) wrap.near — near_deposit + ft_transfer_call into Ref (wNEAR path)
 * 2) token.onsocial.near — ft_transfer_call into Ref (SOCIAL)
 * 3) v2.ref-finance.near — add_liquidity
 *
 * Pure encoding only — no RPC / wallet. Portal UI should reuse these shapes.
 */

export const RHEA_REF_CONTRACT = 'v2.ref-finance.near';
export const SOCIAL_TOKEN_ID = 'token.onsocial.near';
export const WNEAR_TOKEN_ID = 'wrap.near';
export const USDC_TOKEN_ID =
  '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

/** token.onsocial.near NEP-141 — not NEAR’s 24. */
export const SOCIAL_DECIMALS = 18;
export const WNEAR_DECIMALS = 24;
export const USDC_DECIMALS = 6;

export const TREASURY_LP_POOLS = {
  6783: {
    poolId: 6783,
    label: 'SOCIAL-wNEAR',
    tokenIds: [SOCIAL_TOKEN_ID, WNEAR_TOKEN_ID],
    pair: 'wnear',
    pairDecimals: WNEAR_DECIMALS,
  },
  6771: {
    poolId: 6771,
    label: 'SOCIAL-USDC',
    tokenIds: [SOCIAL_TOKEN_ID, USDC_TOKEN_ID],
    pair: 'usdc',
    pairDecimals: USDC_DECIMALS,
  },
};

const ONE_YOCTO = '1';
// act_proposal is capped at 300 TGas per receipt. Keep action gas totals
// under that (plus DAO overhead) when a proposal has multiple actions.
const GAS_30_TGAS = 30_000_000_000_000;
const GAS_200_TGAS = 200_000_000_000_000;

export function encodeArgs(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function assertYocto(amount, label) {
  const trimmed = String(amount ?? '').trim();
  if (!/^\d+$/.test(trimmed) || trimmed === '0') {
    throw new Error(`${label} must be a positive integer yocto amount.`);
  }
  return trimmed;
}

export function applySlippageMin(amountYocto, slippageBps) {
  const amount = BigInt(assertYocto(amountYocto, 'amount'));
  const bps = Number(slippageBps);
  if (!Number.isInteger(bps) || bps < 0 || bps >= 10_000) {
    throw new Error('slippageBps must be an integer in [0, 10000).');
  }
  const kept = 10_000n - BigInt(bps);
  return ((amount * kept) / 10_000n).toString();
}

/** Match the second side to pool reserves for a given SOCIAL amount. */
export function matchPairAmount({
  socialAmountYocto,
  poolSocialYocto,
  poolPairYocto,
}) {
  const social = BigInt(assertYocto(socialAmountYocto, 'socialAmountYocto'));
  const poolSocial = BigInt(assertYocto(poolSocialYocto, 'poolSocialYocto'));
  const poolPair = BigInt(assertYocto(poolPairYocto, 'poolPairYocto'));
  if (poolSocial === 0n) {
    throw new Error('poolSocialYocto cannot be zero.');
  }
  return ((social * poolPair) / poolSocial).toString();
}

function functionCallProposal({ description, receiverId, actions }) {
  return {
    proposal: {
      description,
      kind: {
        FunctionCall: {
          receiver_id: receiverId,
          actions,
        },
      },
    },
  };
}

/**
 * Build the three treasury proposals for adding liquidity to a known pool.
 *
 * @param {object} input
 * @param {6783|6771} input.poolId
 * @param {string} input.socialAmountYocto
 * @param {string} input.pairAmountYocto wNEAR (6783) or USDC (6771) yocto
 * @param {number} [input.slippageBps=50] min_amounts slippage (50 = 0.5%)
 * @param {string} [input.descriptionPrefix]
 * @param {boolean} [input.wrapNear=true] for 6783: include near_deposit in step 1
 */
export function buildTreasuryAddLiquidityProposals(input) {
  const poolId = Number(input.poolId);
  const pool = TREASURY_LP_POOLS[poolId];
  if (!pool) {
    throw new Error(`Unsupported poolId ${input.poolId}; use 6783 or 6771.`);
  }

  const socialAmount = assertYocto(input.socialAmountYocto, 'socialAmountYocto');
  const pairAmount = assertYocto(input.pairAmountYocto, 'pairAmountYocto');
  const slippageBps = input.slippageBps ?? 50;
  const minSocial = applySlippageMin(socialAmount, slippageBps);
  const minPair = applySlippageMin(pairAmount, slippageBps);
  const prefix =
    input.descriptionPrefix?.trim() ||
    `Treasury LP add ${pool.label} pool ${poolId}`;

  const proposals = [];

  if (pool.pair === 'wnear') {
    const wrapNear = input.wrapNear !== false;
    const actions = [];
    if (wrapNear) {
      actions.push({
        method_name: 'near_deposit',
        args: encodeArgs({}),
        deposit: pairAmount,
        gas: GAS_30_TGAS,
      });
    }
    actions.push({
      method_name: 'ft_transfer_call',
      args: encodeArgs({
        receiver_id: RHEA_REF_CONTRACT,
        amount: pairAmount,
        msg: '',
      }),
      deposit: ONE_YOCTO,
      gas: GAS_200_TGAS,
    });
    proposals.push({
      id: '01-wrap-deposit-wnear',
      fileHint: `treasury.lp.${poolId}.01-wrap-deposit-wnear.proposal.json`,
      payload: functionCallProposal({
        description: `${prefix}: wrap NEAR and deposit wNEAR to Ref.`,
        receiverId: WNEAR_TOKEN_ID,
        actions,
      }),
    });
  } else {
    proposals.push({
      id: '01-deposit-usdc',
      fileHint: `treasury.lp.${poolId}.01-deposit-usdc.proposal.json`,
      payload: functionCallProposal({
        description: `${prefix}: deposit USDC to Ref.`,
        receiverId: USDC_TOKEN_ID,
        actions: [
          {
            method_name: 'ft_transfer_call',
            args: encodeArgs({
              receiver_id: RHEA_REF_CONTRACT,
              amount: pairAmount,
              msg: '',
            }),
            deposit: ONE_YOCTO,
            gas: GAS_200_TGAS,
          },
        ],
      }),
    });
  }

  proposals.push({
    id: '02-deposit-social',
    fileHint: `treasury.lp.${poolId}.02-deposit-social.proposal.json`,
    payload: functionCallProposal({
      description: `${prefix}: deposit SOCIAL to Ref.`,
      receiverId: SOCIAL_TOKEN_ID,
      actions: [
        {
          method_name: 'ft_transfer_call',
          args: encodeArgs({
            receiver_id: RHEA_REF_CONTRACT,
            amount: socialAmount,
            msg: '',
          }),
          deposit: ONE_YOCTO,
          gas: GAS_200_TGAS,
        },
      ],
    }),
  });

  proposals.push({
    id: '03-add-liquidity',
    fileHint: `treasury.lp.${poolId}.03-add-liquidity.proposal.json`,
    payload: functionCallProposal({
      description: `${prefix}: add_liquidity.`,
      receiverId: RHEA_REF_CONTRACT,
      actions: [
        {
          method_name: 'add_liquidity',
          args: encodeArgs({
            pool_id: poolId,
            amounts: [socialAmount, pairAmount],
            min_amounts: [minSocial, minPair],
          }),
          deposit: ONE_YOCTO,
          gas: GAS_200_TGAS,
        },
      ],
    }),
  });

  return {
    poolId,
    label: pool.label,
    socialAmountYocto: socialAmount,
    pairAmountYocto: pairAmount,
    minAmounts: [minSocial, minPair],
    slippageBps,
    proposals,
  };
}
