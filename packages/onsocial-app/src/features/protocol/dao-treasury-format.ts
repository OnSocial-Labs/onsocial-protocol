import { formatNearCompact } from '@/lib/format-near-balance';
import { formatSocialCompact } from '@/lib/format-social-balance';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';

function tokenSmallestToDisplay(value: string, decimals: number): string {
  if (!value || value === '0') return '0';
  const safeDecimals = Math.max(0, Math.floor(decimals));
  if (safeDecimals === 0) return value.replace(/^0+/, '') || '0';
  const padded = value.padStart(safeDecimals + 1, '0');
  const whole = padded.slice(0, padded.length - safeDecimals) || '0';
  const fraction = padded
    .slice(padded.length - safeDecimals)
    .replace(/0+$/, '')
    .slice(0, 6);
  return fraction ? `${whole}.${fraction}` : whole;
}

function formatGenericFtCompact(smallest: string, decimals: number): string {
  const raw = Number.parseFloat(tokenSmallestToDisplay(smallest, decimals));
  if (!Number.isFinite(raw) || raw === 0) return '0';
  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(2)}M`;
  if (raw >= 10_000) return `${(raw / 1_000).toFixed(2)}K`;
  if (raw >= 1) {
    return raw.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }
  return raw.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function isNearTreasuryAsset(asset: ProtocolDaoTransferAsset): boolean {
  return !asset.tokenId;
}

export function isSocialTreasuryAsset(asset: ProtocolDaoTransferAsset): boolean {
  return asset.symbol.trim().toUpperCase() === 'SOCIAL';
}

/** Compact display amount for treasury tiles and rows. */
export function formatTreasuryAssetCompact(
  asset: ProtocolDaoTransferAsset
): string {
  if (isNearTreasuryAsset(asset)) {
    return formatNearCompact(asset.balanceSmallest);
  }
  if (isSocialTreasuryAsset(asset)) {
    return formatSocialCompact(asset.balanceSmallest);
  }
  return formatGenericFtCompact(asset.balanceSmallest, asset.decimals);
}

/** Full-precision string for tooltips / screen readers. */
export function formatTreasuryAssetExact(
  asset: ProtocolDaoTransferAsset
): string {
  const amount = tokenSmallestToDisplay(asset.balanceSmallest, asset.decimals);
  return `${amount} ${asset.symbol}`;
}

export function partitionTreasuryAssets(assets: ProtocolDaoTransferAsset[]): {
  near: ProtocolDaoTransferAsset | null;
  social: ProtocolDaoTransferAsset | null;
  other: ProtocolDaoTransferAsset[];
} {
  let near: ProtocolDaoTransferAsset | null = null;
  let social: ProtocolDaoTransferAsset | null = null;
  const other: ProtocolDaoTransferAsset[] = [];

  for (const asset of assets) {
    if (isNearTreasuryAsset(asset)) {
      near = asset;
      continue;
    }
    if (isSocialTreasuryAsset(asset)) {
      social = asset;
      continue;
    }
    other.push(asset);
  }

  return { near, social, other };
}
