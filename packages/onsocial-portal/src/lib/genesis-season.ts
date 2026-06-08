import { yoctoToSocial } from '@/lib/near-rpc';

/** On-chain season id for Genesis Rally (Season 0). */
export const GENESIS_SEASON_ID = 'season-zero';

/** Minimum join_rally spend (100 SOCIAL, 18 decimals). */
export const GENESIS_RALLY_JOIN_YOCTO = 100_000_000_000_000_000_000n;

export const GENESIS_RALLY_JOIN_SOCIAL_LABEL = '100';

export function formatGenesisYoctoAsSocial(yocto: string | bigint): string {
  const raw = typeof yocto === 'bigint' ? yocto.toString() : yocto;
  if (!raw || raw === '0') return '0';
  return yoctoToSocial(raw);
}

/** Wallet balance display — avoids full 18-decimal yocto strings in UI. */
export function formatGenesisSocialBalanceDisplay(
  yocto: string | bigint
): string {
  const raw = typeof yocto === 'bigint' ? yocto.toString() : yocto;
  if (!raw || raw === '0') return '0';

  const social = Number.parseFloat(yoctoToSocial(raw));
  if (!Number.isFinite(social)) return '0';

  return social.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: social >= 1000 ? 0 : social >= 1 ? 2 : 4,
  });
}

export function formatGenesisSeasonTimeRemaining(
  endsAtNs: number
): string | null {
  const nowNs = Date.now() * 1_000_000;
  const remaining = endsAtNs - nowNs;
  if (remaining <= 0) return 'Ended';

  const totalHours = Math.ceil(remaining / (3_600 * 1_000_000_000));
  if (totalHours >= 48) {
    const days = Math.ceil(totalHours / 24);
    return `${days}d left`;
  }
  if (totalHours >= 1) return `${totalHours}h left`;
  return '<1h left';
}
