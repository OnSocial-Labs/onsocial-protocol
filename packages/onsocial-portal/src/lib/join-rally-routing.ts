import { SOCIAL_SPEND_CONTRACT, viewContractAt } from '@/lib/near-rpc';

export interface JoinRallyActionConfig {
  treasury_bps: number;
  season_pool_bps: number;
  target_bps: number;
  burn_bps: number;
}

export interface JoinRallyRoutingDisclosure {
  config: JoinRallyActionConfig;
  protocolFeesRouteToBoost: boolean;
}

function bpsToPercentLabel(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

export function formatJoinRoutingDisclosure(
  disclosure: JoinRallyRoutingDisclosure
): string {
  const { config, protocolFeesRouteToBoost } = disclosure;
  const parts: string[] = [];
  if (config.season_pool_bps > 0) {
    parts.push(`${bpsToPercentLabel(config.season_pool_bps)} to pool`);
  }
  if (config.treasury_bps > 0) {
    parts.push(
      protocolFeesRouteToBoost
        ? `${bpsToPercentLabel(config.treasury_bps)} boost credits`
        : `${bpsToPercentLabel(config.treasury_bps)} fees`
    );
  }
  if (config.burn_bps > 0) {
    parts.push(`${bpsToPercentLabel(config.burn_bps)} burn`);
  }
  if (config.target_bps > 0) {
    parts.push(`${bpsToPercentLabel(config.target_bps)} to target`);
  }
  return parts.join(' · ');
}

export async function fetchJoinRallyRouting(): Promise<JoinRallyRoutingDisclosure | null> {
  const [config, contractInfo] = await Promise.all([
    viewContractAt<JoinRallyActionConfig>(
      SOCIAL_SPEND_CONTRACT,
      'get_action_config',
      { action_id: 'join_rally' }
    ),
    viewContractAt<{ boost_contract_id?: string | null }>(
      SOCIAL_SPEND_CONTRACT,
      'get_contract_info',
      {}
    ),
  ]);

  if (!config) return null;

  const boostContractId =
    typeof contractInfo?.boost_contract_id === 'string'
      ? contractInfo.boost_contract_id.trim()
      : '';

  return {
    config: {
      treasury_bps: config.treasury_bps ?? 0,
      season_pool_bps: config.season_pool_bps ?? 0,
      target_bps: config.target_bps ?? 0,
      burn_bps: config.burn_bps ?? 0,
    },
    protocolFeesRouteToBoost: boostContractId.length > 0,
  };
}
