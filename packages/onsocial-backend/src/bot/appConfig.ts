// ---------------------------------------------------------------------------
// On-chain app config (single source of truth for reward rates)
// ---------------------------------------------------------------------------
// Fetches get_app_config from the rewards contract on every call — it's a
// cheap view call (~50ms, zero gas) and help/start/nudge are infrequent.
// Falls back to local config.rewards if the call fails.
// ---------------------------------------------------------------------------

import { viewContract } from '../services/near.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

interface AppConfig {
  /** e.g. "0.1" */
  messageReward: string;
  /** e.g. 1 */
  dailyCap: number;
}

/** Fetch the on-chain app config with fallback to env config. */
export async function getAppConfig(): Promise<AppConfig> {
  try {
    const onChain = await viewContract<{
      daily_cap: string;
      reward_per_action: string;
      label: string;
    } | null>('get_app_config', { app_id: config.appId });

    if (onChain) {
      const dailyCap = Number(BigInt(onChain.daily_cap)) / 1e18;
      const rewardRaw = Number(BigInt(onChain.reward_per_action)) / 1e18;
      // Format nicely: 0.1 not 0.10000000000000001
      const messageReward =
        rewardRaw < 1
          ? parseFloat(rewardRaw.toPrecision(4)).toString()
          : String(rewardRaw);

      return { messageReward, dailyCap };
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch on-chain app config, using fallback');
  }

  // Fallback to env-based config
  return {
    messageReward: String(config.rewards.messageReward),
    dailyCap: config.rewards.dailyCap,
  };
}
