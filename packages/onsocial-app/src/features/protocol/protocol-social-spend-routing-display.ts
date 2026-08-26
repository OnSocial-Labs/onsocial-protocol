import {
  PROTOCOL_CONTRACT_CONFIG_OPS,
  type ProtocolContractConfigOpId,
} from '@/features/protocol/protocol-contracts';
import { yoctoToSocial } from '@/lib/format-social-balance';

function readBps(config: Record<string, unknown>, field: string): number {
  const value = config[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readMinAmountYocto(config: Record<string, unknown>): string | null {
  const raw = config.min_amount;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function minAmountsEqual(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return left === right;
  }
}

function resolveConfigDefaults(actionId: string | null | undefined) {
  const normalized = actionId?.trim();
  if (!normalized) return null;
  return (
    PROTOCOL_CONTRACT_CONFIG_OPS.find((op) => op.actionId === normalized)
      ?.defaults ?? null
  );
}

export function formatSocialSpendActionRoutingSummary(
  config: Record<string, unknown>,
  options?: { protocolFeesRouteToBoost?: boolean }
): string {
  const season = readBps(config, 'season_pool_bps');
  const treasury = readBps(config, 'treasury_bps');
  const target = readBps(config, 'target_bps');
  const burn = readBps(config, 'burn_bps');
  const parts: string[] = [];

  if (season > 0) {
    parts.push(`${season / 100}% season`);
  }
  if (treasury > 0) {
    parts.push(
      options?.protocolFeesRouteToBoost === false
        ? `${treasury / 100}% fees`
        : `${treasury / 100}% boost pool`
    );
  }
  if (target > 0) {
    parts.push(`${target / 100}% target`);
  }
  if (burn > 0) {
    parts.push(`${burn / 100}% burn`);
  }

  return parts.join(' · ') || 'No routing';
}

export function formatSocialSpendMinAmountCardLabel(
  minAmountYocto: string | null | undefined
): string | null {
  const trimmed = minAmountYocto?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed) || trimmed === '0') {
    return null;
  }
  return `min ${yoctoToSocial(trimmed)} SOCIAL`;
}

export function shouldShowSocialSpendMinOnProposalCard(
  config: Record<string, unknown>,
  actionId: string | null | undefined
): boolean {
  const minAmount = readMinAmountYocto(config);
  if (!minAmount) return false;
  const defaults = resolveConfigDefaults(actionId);
  if (!defaults) return false;
  return !minAmountsEqual(minAmount, defaults.minAmountYocto);
}

/** Card routing line for social-spend `set_action_config` proposals. */
export function formatSocialSpendActionConfigCardSummary(
  config: unknown,
  actionId: string | null | undefined,
  options?: { protocolFeesRouteToBoost?: boolean }
): string {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return 'No routing';
  }
  const record = config as Record<string, unknown>;
  const routing = formatSocialSpendActionRoutingSummary(record, options);

  if (!shouldShowSocialSpendMinOnProposalCard(record, actionId)) {
    return routing;
  }

  const minLabel = formatSocialSpendMinAmountCardLabel(readMinAmountYocto(record));
  if (!minLabel) {
    return routing;
  }

  return routing === 'No routing' ? minLabel : `${minLabel} · ${routing}`;
}

export function isProtocolContractConfigActionId(
  actionId: string | null | undefined
): actionId is ProtocolContractConfigOpId {
  const normalized = actionId?.trim();
  if (!normalized) return false;
  return PROTOCOL_CONTRACT_CONFIG_OPS.some((op) => op.actionId === normalized);
}
