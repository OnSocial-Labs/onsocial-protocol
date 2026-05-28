// ---------------------------------------------------------------------------
// On-chain app config (single source of truth for reward rates)
// ---------------------------------------------------------------------------

import { config } from '../config/index.js';
import {
  formatSocialAmount,
  getOnChainAppRewardConfig,
  yoctoToSocialNumber,
} from '../services/app-reward-limits.js';

interface AppConfig {
  /** e.g. "0.1" */
  messageReward: string;
  /** e.g. 1 */
  dailyCap: number;
}

/** Fetch the on-chain app config with fallback to env config. */
export async function getAppConfig(): Promise<AppConfig> {
  const onChain = await getOnChainAppRewardConfig(config.appId);
  if (onChain) {
    return {
      messageReward: formatSocialAmount(onChain.rewardPerActionYocto),
      dailyCap: yoctoToSocialNumber(onChain.dailyCapYocto),
    };
  }

  return {
    messageReward: String(config.rewards.messageReward),
    dailyCap: config.rewards.dailyCap,
  };
}
