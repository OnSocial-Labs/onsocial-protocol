import { parseSocialSpendActionConfigView } from '@/lib/dao-contract-config-operations';
import {
  SOCIAL_SPEND_CONTRACT,
  viewContractAt,
  yoctoToSocial,
} from '@/lib/near-rpc';

export interface JoinRallyActionConfig {
  treasury_bps: number;
  season_pool_bps: number;
  target_bps: number;
  burn_bps: number;
  min_amount: string;
}

export interface JoinRallyRoutingDisclosure {
  config: JoinRallyActionConfig;
  protocolFeesRouteToBoost: boolean;
  joinMinAmountYocto: bigint;
  joinMinAmountSocialLabel: string;
}

function bpsToPercentLabel(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

export function parseJoinRallyMinAmount(
  config: Pick<JoinRallyActionConfig, 'min_amount'> | null | undefined
): { yocto: bigint; socialLabel: string } | null {
  const minAmount = config?.min_amount?.trim() ?? '';
  if (!/^\d+$/u.test(minAmount)) {
    return null;
  }

  try {
    const yocto = BigInt(minAmount);
    if (yocto <= 0n) {
      return null;
    }

    return {
      yocto,
      socialLabel: yoctoToSocial(minAmount),
    };
  } catch {
    return null;
  }
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

export function formatJoinEntryGuideLabel(
  disclosure: JoinRallyRoutingDisclosure | null,
  options: { loading?: boolean } = {}
): string {
  if (options.loading) {
    return 'Loading rally entry…';
  }

  if (!disclosure) {
    return 'Rally entry unavailable';
  }

  const routing = formatJoinRoutingDisclosure(disclosure);
  return routing
    ? `${disclosure.joinMinAmountSocialLabel} SOCIAL · ${routing}`
    : `${disclosure.joinMinAmountSocialLabel} SOCIAL`;
}

/** Estimate SOCIAL burned from indexed join pool contributions and routing bps. */
export function estimateJoinBurnYocto(
  joinPoolYocto: string | bigint,
  seasonPoolBps: number,
  burnBps: number
): bigint {
  if (burnBps <= 0 || seasonPoolBps <= 0) {
    return 0n;
  }

  const joinPool = readJoinPoolYocto(joinPoolYocto);
  if (joinPool <= 0n) {
    return 0n;
  }

  const totalSpend = (joinPool * 10_000n) / BigInt(seasonPoolBps);
  return (totalSpend * BigInt(burnBps)) / 10_000n;
}

function readJoinPoolYocto(joinPoolYocto: string | bigint): bigint {
  return typeof joinPoolYocto === 'bigint'
    ? joinPoolYocto
    : BigInt(joinPoolYocto || '0');
}

/** Estimate protocol fee share from indexed join pool (boost credits or treasury fees). */
export function estimateJoinTreasuryYocto(
  joinPoolYocto: string | bigint,
  seasonPoolBps: number,
  treasuryBps: number
): bigint {
  if (treasuryBps <= 0 || seasonPoolBps <= 0) {
    return 0n;
  }

  const joinPool = readJoinPoolYocto(joinPoolYocto);
  if (joinPool <= 0n) {
    return 0n;
  }

  const totalSpend = (joinPool * 10_000n) / BigInt(seasonPoolBps);
  return (totalSpend * BigInt(treasuryBps)) / 10_000n;
}

export async function fetchJoinRallyRouting(): Promise<JoinRallyRoutingDisclosure | null> {
  const [rawConfig, contractInfo] = await Promise.all([
    viewContractAt<unknown>(SOCIAL_SPEND_CONTRACT, 'get_action_config', {
      action_id: 'join_rally',
    }),
    viewContractAt<{ boost_contract_id?: string | null }>(
      SOCIAL_SPEND_CONTRACT,
      'get_contract_info',
      {}
    ),
  ]);

  const parsed = parseSocialSpendActionConfigView(rawConfig);
  if (!parsed) return null;

  const joinMinAmount = parseJoinRallyMinAmount(parsed);
  if (!joinMinAmount) return null;

  const boostContractId =
    typeof contractInfo?.boost_contract_id === 'string'
      ? contractInfo.boost_contract_id.trim()
      : '';

  return {
    config: {
      treasury_bps: parsed.treasury_bps,
      season_pool_bps: parsed.season_pool_bps,
      target_bps: parsed.target_bps,
      burn_bps: parsed.burn_bps,
      min_amount: parsed.min_amount,
    },
    protocolFeesRouteToBoost: boostContractId.length > 0,
    joinMinAmountYocto: joinMinAmount.yocto,
    joinMinAmountSocialLabel: joinMinAmount.socialLabel,
  };
}
