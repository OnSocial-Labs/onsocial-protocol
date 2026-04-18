import { describe, expect, it } from 'vitest';
import {
  buildPostAction,
  buildProfileAction,
  buildReactionAction,
  buildRewardsClaimAction,
  buildRewardsCreditAction,
  buildScarcesCreateCollectionAction,
  buildScarcesListNativeAction,
  buildScarcesPurchaseNativeAction,
  buildStandWithAction,
  buildUnstandAction,
  prepareCoreRequest,
  prepareRewardsRequest,
  prepareScarcesRequest,
  resolveContractId,
} from './actions.js';

describe('advanced action helpers', () => {
  it('builds canonical core set actions for profile, post, standing, and reaction flows', () => {
    expect(buildProfileAction({ name: 'Alice', bio: 'Builder' })).toEqual({
      type: 'set',
      data: {
        'profile/v': '1',
        'profile/name': 'Alice',
        'profile/bio': 'Builder',
      },
    });

    expect(buildPostAction({ text: 'Hello' }, '123', 42)).toEqual({
      type: 'set',
      data: {
        'post/123': { v: 1, text: 'Hello', timestamp: 42 },
      },
    });

    expect(buildStandWithAction('bob.near', 99)).toEqual({
      type: 'set',
      data: {
        'standing/bob.near': { v: 1, since: 99 },
      },
    });

    expect(buildUnstandAction('bob.near')).toEqual({
      type: 'set',
      data: {
        'standing/bob.near': null,
      },
    });

    expect(buildReactionAction('bob.near', 'post/123', { type: 'like' })).toEqual({
      type: 'set',
      data: {
        'reaction/bob.near/like/post/123': { v: 1, type: 'like' },
      },
    });
  });

  it('builds canonical rewards actions', () => {
    expect(
      buildRewardsCreditAction({
        accountId: 'alice.near',
        amount: '1000',
        source: 'message',
        appId: 'chat',
      }),
    ).toEqual({
      type: 'credit_reward',
      account_id: 'alice.near',
      amount: '1000',
      source: 'message',
      app_id: 'chat',
    });

    expect(buildRewardsClaimAction()).toEqual({ type: 'claim' });
  });

  it('builds canonical scarces actions', () => {
    expect(
      buildScarcesCreateCollectionAction({
        collectionId: 'genesis',
        totalSupply: 100,
        title: 'Genesis',
        priceNear: '1',
      }),
    ).toEqual({
      type: 'create_collection',
      collection_id: 'genesis',
      total_supply: 100,
      metadata_template: JSON.stringify({ title: 'Genesis' }),
      price_near: '1000000000000000000000000',
    });

    expect(
      buildScarcesListNativeAction({ tokenId: '1', priceNear: '2' }),
    ).toEqual({
      type: 'list_native_scarce',
      token_id: '1',
      price: '2000000000000000000000000',
    });

    expect(buildScarcesPurchaseNativeAction('1')).toEqual({
      type: 'purchase_native_scarce',
      token_id: '1',
    });
  });

  it('prepares requests with network-aware default target contracts', () => {
    expect(resolveContractId('testnet', 'core')).toBe('core.onsocial.testnet');
    expect(resolveContractId('testnet', 'scarces')).toBe('scarces.onsocial.testnet');
    expect(resolveContractId('testnet', 'rewards')).toBe('rewards.onsocial.testnet');

    expect(
      prepareCoreRequest(buildProfileAction({ name: 'Alice' }), 'testnet'),
    ).toEqual({
      targetAccount: 'core.onsocial.testnet',
      action: {
        type: 'set',
        data: { 'profile/v': '1', 'profile/name': 'Alice' },
      },
    });

    expect(prepareRewardsRequest(buildRewardsClaimAction(), 'mainnet')).toEqual({
      targetAccount: 'rewards.onsocial.near',
      action: { type: 'claim' },
    });

    expect(
      prepareScarcesRequest(
        buildScarcesPurchaseNativeAction('7'),
        'testnet',
        'custom.testnet',
      ),
    ).toEqual({
      targetAccount: 'custom.testnet',
      action: {
        type: 'purchase_native_scarce',
        token_id: '7',
      },
    });
  });
});
