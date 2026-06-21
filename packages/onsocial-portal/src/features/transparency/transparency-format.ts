import { yoctoToSocial } from '@/lib/near-rpc';
import {
  INITIAL_SUPPLY_OVERVIEW_UNITS,
  INITIAL_SUPPLY_YOCTO,
  SUPPLY_OVERVIEW_FRACTION_DIGITS,
  SUPPLY_OVERVIEW_SCALE,
  TRANSPARENCY_EXPLORER_URL,
  YOCTO_PER_SOCIAL,
} from '@/features/transparency/transparency-constants';

export function formatWholeTokenAmount(raw: string): string {
  const human = yoctoToSocial(raw);
  const whole = BigInt(human.split('.')[0] || '0');
  return whole.toLocaleString('en-US');
}

function yoctoToOverviewUnits(yocto: bigint): bigint {
  return (
    (yocto * SUPPLY_OVERVIEW_SCALE + YOCTO_PER_SOCIAL / 2n) / YOCTO_PER_SOCIAL
  );
}

function formatOverviewUnits(units: bigint): string {
  const whole = units / SUPPLY_OVERVIEW_SCALE;
  const fraction = units % SUPPLY_OVERVIEW_SCALE;
  if (fraction === 0n) {
    return whole.toLocaleString('en-US');
  }

  return `${whole.toLocaleString('en-US')}.${fraction
    .toString()
    .padStart(SUPPLY_OVERVIEW_FRACTION_DIGITS, '0')}`;
}

export function formatSupplyOverviewFromYocto(supplyYocto: bigint): {
  supplyDisplay: string;
  burnedDisplay: string;
} {
  const supplyUnits = yoctoToOverviewUnits(supplyYocto);
  const burnedUnits =
    supplyYocto <= INITIAL_SUPPLY_YOCTO
      ? INITIAL_SUPPLY_OVERVIEW_UNITS - supplyUnits
      : 0n;

  return {
    supplyDisplay: formatOverviewUnits(supplyUnits),
    burnedDisplay: formatOverviewUnits(burnedUnits),
  };
}

export function formatTokenAmount(
  raw: string,
  decimals: number,
  maxFractionDigits = 2
): string {
  if (!raw || raw === '0') {
    return '0';
  }

  const padded = raw.padStart(decimals + 1, '0');
  const whole = BigInt(padded.slice(0, padded.length - decimals) || '0');
  const fraction = padded
    .slice(padded.length - decimals)
    .replace(/0+$/, '')
    .slice(0, maxFractionDigits);

  return fraction
    ? `${whole.toLocaleString('en-US')}.${fraction}`
    : whole.toLocaleString('en-US');
}

export function formatPercent(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) {
    return '0.0';
  }

  const tenths = (numerator * 1000n) / denominator;
  const whole = tenths / 10n;
  const fraction = tenths % 10n;

  return `${whole.toString()}.${fraction.toString()}`;
}

export function getAccountExplorerLink(account: string): string | null {
  return account.endsWith('.near') || account.endsWith('.testnet')
    ? `${TRANSPARENCY_EXPLORER_URL}/address/${account}`
    : null;
}
