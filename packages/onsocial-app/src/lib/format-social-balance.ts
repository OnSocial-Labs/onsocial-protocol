const SOCIAL_DECIMALS = 18;

export function yoctoToSocial(yocto: string | bigint): string {
  const raw = typeof yocto === 'bigint' ? yocto.toString() : yocto;
  if (!raw || raw === '0') {
    return '0';
  }

  const padded = raw.padStart(SOCIAL_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - SOCIAL_DECIMALS) || '0';
  const frac = padded
    .slice(padded.length - SOCIAL_DECIMALS)
    .replace(/0+$/, '');

  return frac ? `${whole}.${frac}` : whole;
}

export function formatSocialCompact(yocto: string | bigint): string {
  const raw = Number.parseFloat(yoctoToSocial(yocto));
  if (!Number.isFinite(raw) || raw === 0) {
    return '0';
  }

  if (raw >= 1_000_000) {
    return `${(raw / 1_000_000).toFixed(1)}M`;
  }
  if (raw >= 10_000) {
    return `${(raw / 1_000).toFixed(1)}K`;
  }
  if (raw >= 1_000) {
    return raw.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return raw.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
