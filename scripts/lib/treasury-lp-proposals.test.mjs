import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RHEA_REF_CONTRACT,
  SOCIAL_DECIMALS,
  SOCIAL_TOKEN_ID,
  WNEAR_DECIMALS,
  WNEAR_TOKEN_ID,
  applySlippageMin,
  buildTreasuryAddLiquidityProposals,
  encodeArgs,
  matchPairAmount,
} from './treasury-lp-proposals.mjs';

test('SOCIAL is 18 decimals, wNEAR is 24', () => {
  assert.equal(SOCIAL_DECIMALS, 18);
  assert.equal(WNEAR_DECIMALS, 24);
  // 0.002 SOCIAL at 18 decimals — treating as 24 would be 2000 SOCIAL.
  assert.equal(2n * 10n ** 15n, 2_000_000_000_000_000n);
  assert.equal(2n * 10n ** 21n, 2_000_000_000_000_000_000_000n);
});

test('matchPairAmount follows pool ratio', () => {
  // 2 SOCIAL : 3 wNEAR reserves → 1 SOCIAL needs 1.5 wNEAR
  assert.equal(
    matchPairAmount({
      socialAmountYocto: '100',
      poolSocialYocto: '200',
      poolPairYocto: '300',
    }),
    '150'
  );
});

test('applySlippageMin keeps 99.5% at 50 bps', () => {
  assert.equal(applySlippageMin('1000000', 50), '995000');
});

test('buildTreasuryAddLiquidityProposals emits 3 steps for 6783', () => {
  const built = buildTreasuryAddLiquidityProposals({
    poolId: 6783,
    // 0.05 SOCIAL (18 decimals) + 0.06 wNEAR (24 decimals)
    socialAmountYocto: '50000000000000000',
    pairAmountYocto: '60000000000000000000000',
    slippageBps: 50,
  });

  assert.equal(built.proposals.length, 3);

  const [wrap, social, add] = built.proposals.map((p) => p.payload.proposal);

  assert.equal(wrap.kind.FunctionCall.receiver_id, WNEAR_TOKEN_ID);
  assert.equal(wrap.kind.FunctionCall.actions.length, 2);
  assert.equal(wrap.kind.FunctionCall.actions[0].method_name, 'near_deposit');
  assert.equal(
    wrap.kind.FunctionCall.actions[0].deposit,
    '60000000000000000000000' // 0.06 wNEAR
  );
  assert.equal(
    wrap.kind.FunctionCall.actions[1].method_name,
    'ft_transfer_call'
  );

  assert.equal(social.kind.FunctionCall.receiver_id, SOCIAL_TOKEN_ID);
  assert.equal(
    social.kind.FunctionCall.actions[0].method_name,
    'ft_transfer_call'
  );

  assert.equal(add.kind.FunctionCall.receiver_id, RHEA_REF_CONTRACT);
  assert.equal(add.kind.FunctionCall.actions[0].method_name, 'add_liquidity');

  const addArgs = JSON.parse(
    Buffer.from(add.kind.FunctionCall.actions[0].args, 'base64').toString(
      'utf8'
    )
  );
  assert.equal(addArgs.pool_id, 6783);
  assert.deepEqual(addArgs.amounts, [
    '50000000000000000',
    '60000000000000000000000',
  ]);
  assert.deepEqual(addArgs.min_amounts, [
    applySlippageMin('50000000000000000', 50),
    applySlippageMin('60000000000000000000000', 50),
  ]);

  const depositMsg = JSON.parse(
    Buffer.from(social.kind.FunctionCall.actions[0].args, 'base64').toString(
      'utf8'
    )
  );
  assert.equal(depositMsg.receiver_id, RHEA_REF_CONTRACT);
  assert.equal(depositMsg.msg, '');
});

test('encodeArgs is UTF-8 JSON base64', () => {
  assert.equal(encodeArgs({ a: 1 }), Buffer.from('{"a":1}').toString('base64'));
});

test('6771 path deposits USDC without wrap', () => {
  const built = buildTreasuryAddLiquidityProposals({
    poolId: 6771,
    socialAmountYocto: '1000',
    pairAmountYocto: '2',
  });
  assert.equal(built.proposals.length, 3);
  assert.equal(
    built.proposals[0].payload.proposal.kind.FunctionCall.actions[0]
      .method_name,
    'ft_transfer_call'
  );
  assert.match(built.proposals[0].id, /usdc/);
});
