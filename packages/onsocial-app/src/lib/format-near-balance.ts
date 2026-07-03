import { yoctoToNear } from '@/lib/app-near-rpc';

export function formatNearCompact(yocto: string | bigint): string {
  const raw = Number.parseFloat(yoctoToNear(String(yocto ?? '0')));
  if (!Number.isFinite(raw) || raw === 0) return '0';

  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(2)}M`;
  if (raw >= 10_000) return `${(raw / 1_000).toFixed(2)}K`;
  if (raw >= 1_000) {
    return raw.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (raw >= 1) {
    return raw.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  return raw.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}
