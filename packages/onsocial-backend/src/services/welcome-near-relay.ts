import { config } from '../config/index.js';

export interface RelayerTransferResult {
  success: boolean;
  status?: string;
  tx_hash?: string;
  error?: string;
  httpStatus: number;
}

/**
 * Ask the relayer to transfer NEAR from the relayer account to a user wallet.
 */
export async function relayWelcomeNearTransfer(
  recipientId: string,
  amountYocto: string
): Promise<RelayerTransferResult> {
  const response = await fetch(
    `${config.relayerUrl}/execute_transfer?wait=true`,
    {
      method: 'POST',
      headers: relayerHeaders(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        recipient_id: recipientId,
        amount_yocto: amountYocto,
      }),
    }
  );

  let data: Partial<RelayerTransferResult> = {};
  try {
    data = (await response.json()) as Partial<RelayerTransferResult>;
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
