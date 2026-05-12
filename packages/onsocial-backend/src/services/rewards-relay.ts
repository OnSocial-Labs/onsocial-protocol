import { config } from '../config/index.js';

export type RewardsAction =
  | {
      type: 'credit_reward';
      account_id: string;
      amount: string;
      source?: string;
      app_id?: string;
    }
  | {
      type: 'claim';
      account_id: string;
    };

export interface RelayerRewardsResult {
  success: boolean;
  status?: string;
  tx_hash?: string;
  error?: string;
  httpStatus: number;
}

/**
 * Sends a typed rewards action to the private relayer. The relayer signs the
 * direct rewards transaction from its KMS lane pool, so the rewards contract
 * sees the authorized relayer account as predecessor.
 */
export async function relayRewardsAction(
  action: RewardsAction
): Promise<RelayerRewardsResult> {
  const response = await fetch(
    `${config.relayerUrl}/execute_rewards?wait=true`,
    {
      method: 'POST',
      headers: relayerHeaders(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ action }),
    }
  );

  let data: Partial<RelayerRewardsResult> = {};
  try {
    data = (await response.json()) as Partial<RelayerRewardsResult>;
  } catch {
    data = {};
  }

  return {
    success: response.ok && data.success === true,
    status: data.status,
    tx_hash: data.tx_hash,
    error: data.error,
    httpStatus: response.status,
  };
}

function relayerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.relayerApiKey) {
    headers['X-Api-Key'] = config.relayerApiKey;
  }
  return headers;
}
