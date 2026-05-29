import { config } from '../config/index.js';
import { viewAccountBalance } from './near.js';

export async function accountNeedsWelcomeNear(
  accountId: string
): Promise<boolean> {
  if (!config.welcomeNear.enabled) {
    return false;
  }

  const balance = await viewAccountBalance(accountId);
  if (balance == null) {
    return true;
  }

  try {
    return BigInt(balance) < BigInt(config.welcomeNear.thresholdYocto);
  } catch {
    return true;
  }
}
