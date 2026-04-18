// Rewards SDK ↔ contract parity fixtures.

import type { Network } from '../types.js';
import type { RewardsAction } from './actions.js';
import {
  buildRewardsClaimAction,
  buildRewardsCreditAction,
  prepareRewardsRequest,
} from './actions.js';

export interface RewardsParityCase {
  name: string;
  action: RewardsAction;
  expectedAction: RewardsAction;
  targetAccount: string;
}

export function getRewardsParityCases(
  network: Network = 'testnet',
): RewardsParityCase[] {
  const cases: Array<{
    name: string;
    action: RewardsAction;
    expectedAction: RewardsAction;
  }> = [
    {
      name: 'credit reward minimal',
      action: buildRewardsCreditAction({
        accountId: 'alice.near',
        amount: '1000',
      }),
      expectedAction: {
        type: 'credit_reward',
        account_id: 'alice.near',
        amount: '1000',
      },
    },
    {
      name: 'credit reward with source and app',
      action: buildRewardsCreditAction({
        accountId: 'alice.near',
        amount: '2500',
        source: 'engagement',
        appId: 'social-app',
      }),
      expectedAction: {
        type: 'credit_reward',
        account_id: 'alice.near',
        amount: '2500',
        source: 'engagement',
        app_id: 'social-app',
      },
    },
    {
      name: 'claim',
      action: buildRewardsClaimAction(),
      expectedAction: { type: 'claim' },
    },
  ];

  return cases.map(({ name, action, expectedAction }) => ({
    name,
    action,
    expectedAction,
    targetAccount: prepareRewardsRequest(action, network).targetAccount,
  }));
}
