import { config } from '../../config/index.js';
import { logger } from '../../logger.js';

interface NearblocksTxnAction {
  action?: string;
  method?: string;
  args?: string;
}

interface NearblocksTxnRow {
  transaction_hash?: string;
  actions?: NearblocksTxnAction[];
}

function nearblocksApiBase(): string {
  return config.nearNetwork === 'mainnet'
    ? 'https://api.nearblocks.io/v1'
    : 'https://api-testnet.nearblocks.io/v1';
}

function decodeActionArgs(
  args: string | undefined
): Record<string, unknown> | null {
  if (!args || typeof args !== 'string') return null;
  const trimmed = args.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed) as Record<string, unknown>;
    }
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function actionMatchesSeasonClaim(
  action: NearblocksTxnAction,
  seasonId: string
): boolean {
  const method = (action.method ?? action.action ?? '').trim();
  if (method !== 'claim_season_reward') return false;

  const args = decodeActionArgs(action.args);
  const claimedSeasonId =
    typeof args?.season_id === 'string'
      ? args.season_id.trim()
      : typeof args?.seasonId === 'string'
        ? args.seasonId.trim()
        : '';
  return claimedSeasonId === seasonId;
}

export async function lookupSeasonClaimTxHash(
  accountId: string,
  seasonId: string
): Promise<string | null> {
  const contract = config.socialSpendContract.trim();
  if (!accountId || !seasonId || !contract) return null;

  const url = `${nearblocksApiBase()}/account/${encodeURIComponent(accountId)}/txns?receiver=${encodeURIComponent(contract)}&per_page=40&order=desc`;

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { txns?: NearblocksTxnRow[] };
    const txns = Array.isArray(body.txns) ? body.txns : [];

    for (const txn of txns) {
      const hash = txn.transaction_hash?.trim();
      if (!hash) continue;
      const actions = Array.isArray(txn.actions) ? txn.actions : [];
      if (
        actions.some((action) => actionMatchesSeasonClaim(action, seasonId))
      ) {
        return hash;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { accountId, seasonId, error: message },
      'Season claim tx lookup failed'
    );
  }

  return null;
}
