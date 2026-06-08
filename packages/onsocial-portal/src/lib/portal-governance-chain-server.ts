import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';
import {
  REWARDS_CONTRACT,
  viewContractAt,
  type OnChainAppConfig,
} from '@/lib/near-rpc';

export async function loadRewardsAppConfig(
  appId: string
): Promise<OnChainAppConfig | null> {
  return viewContractAt<OnChainAppConfig>(REWARDS_CONTRACT, 'get_app_config', {
    app_id: appId,
  }).catch(() => null);
}
