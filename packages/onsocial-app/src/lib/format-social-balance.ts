const SOCIAL_DECIMALS = 18;

/** Hasura NUMERIC boards (earners) arrive as JSON numbers, not strings. */
export type SocialYocto = string | number | bigint | null | undefined;

function yoctoDigits(yocto: SocialYocto): string {
  if (typeof yocto === 'bigint') return yocto.toString();
  if (typeof yocto === 'number') {
    if (!Number.isFinite(yocto)) return '';
    return BigInt(Math.trunc(yocto)).toString();
  }
  if (typeof yocto === 'string') {
    const trimmed = yocto.trim();
    return /^[+-]?\d+$/.test(trimmed) ? trimmed.replace(/^\+/, '') : '';
  }
  return '';
}

export function yoctoToSocial(yocto: SocialYocto): string {
  const raw = yoctoDigits(yocto);
  if (!raw || raw === '0' || raw === '-0') {
    return '0';
  }

  const padded = raw.replace(/^-/, '').padStart(SOCIAL_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - SOCIAL_DECIMALS) || '0';
  const frac = padded
    .slice(padded.length - SOCIAL_DECIMALS)
    .replace(/0+$/, '');

  const signed = frac ? `${whole}.${frac}` : whole;
  return raw.startsWith('-') ? `-${signed}` : signed;
}

export function formatSocialCompact(yocto: SocialYocto): string {
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
