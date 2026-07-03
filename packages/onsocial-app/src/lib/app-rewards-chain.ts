import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { createConfiguredNearRpc, type NearRpc } from '@onsocial/rpc';

export const APP_REWARDS_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'rewards.onsocial.near'
    : 'rewards.onsocial.testnet';

/** Same on-chain app_id as portal platform credits. */
export const APP_REWARDS_CONTRACT_APP_ID = 'onsocial_portal';

export interface AppRewardsOverviewView {
  claimable: string;
  total_earned: string;
  total_claimed: string;
}

interface OnChainRewardsOverview {
  claimable?: string;
  total_earned?: string;
  total_claimed?: string;
}

let _rpc: NearRpc | null = null;

function getServerRpc(): NearRpc {
  if (!_rpc) {
    _rpc = createConfiguredNearRpc({
      network: ACTIVE_NEAR_NETWORK,
      publicOnly: false,
      timeoutMs: 8_000,
      maxRetries: 1,
    });
  }
  return _rpc;
}

function encodeViewArgs(args: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(args)).toString('base64');
}

export async function viewRewardsContract<T>(
  method: string,
  args: Record<string, unknown>
): Promise<T | null> {
  const rpc = getServerRpc();
  const response = await rpc.call<{ result?: number[] }>('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: APP_REWARDS_CONTRACT,
    method_name: method,
    args_base64: encodeViewArgs(args),
  });

  const bytes = response.result?.result;
  if (!bytes) {
    return null;
  }

  const decoded = new TextDecoder().decode(new Uint8Array(bytes));
  return JSON.parse(decoded) as T;
}

export async function loadAppRewardsOverview(
  accountId: string
): Promise<AppRewardsOverviewView | null> {
  const overview = await viewRewardsContract<OnChainRewardsOverview>(
    'get_user_rewards_overview',
    { account_id: accountId, app_id: APP_REWARDS_CONTRACT_APP_ID }
  );

  if (!overview) {
    return null;
  }

  return {
    claimable: overview.claimable ?? '0',
    total_earned: overview.total_earned ?? '0',
    total_claimed: overview.total_claimed ?? '0',
  };
}
