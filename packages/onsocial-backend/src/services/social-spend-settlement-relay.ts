import { config } from '../config/index.js';

export interface SocialSpendSettlementRequest {
  seasonId: string;
  root: string;
  totalAmount: string;
  active: boolean;
}

export interface RelayerSocialSpendSettlementResult {
  success: boolean;
  status?: string;
  tx_hash?: string;
  error?: string;
  httpStatus: number;
}

export async function relaySocialSpendSettlement(
  settlement: SocialSpendSettlementRequest
): Promise<RelayerSocialSpendSettlementResult> {
  const response = await fetch(
    `${config.relayerUrl}/execute_social_spend_settlement?wait=true`,
    {
      method: 'POST',
      headers: relayerHeaders(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        season_id: settlement.seasonId,
        root: settlement.root,
        total_amount: settlement.totalAmount,
        active: settlement.active,
      }),
    }
  );

  let data: Partial<RelayerSocialSpendSettlementResult> = {};
  try {
    data =
      (await response.json()) as Partial<RelayerSocialSpendSettlementResult>;
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
