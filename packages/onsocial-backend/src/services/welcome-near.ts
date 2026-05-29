import { config } from '../config/index.js';
import { viewAccountBalance } from './near.js';

function parseYocto(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

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

  const threshold = parseYocto(config.welcomeNear.thresholdYocto);
  const liquid = parseYocto(balance);
  if (threshold == null || liquid == null) {
    return true;
  }

  return liquid < threshold;
}

/** Top-up amount to reach the welcome target, capped by maxDripYocto. */
export function welcomeNearTopUpAmountYocto(
  balanceYocto: string | null
): string | null {
  const threshold = parseYocto(config.welcomeNear.thresholdYocto);
  const target = parseYocto(config.welcomeNear.targetBalanceYocto);
  const maxDrip = parseYocto(config.welcomeNear.maxDripYocto);
  const liquid = parseYocto(balanceYocto ?? '0');

  if (threshold == null || target == null || maxDrip == null || liquid == null) {
    return null;
  }

  if (liquid >= threshold) {
    return null;
  }

  const topUp = target - liquid;
  if (topUp <= 0n) {
    return null;
  }

  return (topUp > maxDrip ? maxDrip : topUp).toString();
}
