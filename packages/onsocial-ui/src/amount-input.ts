/** Sanitize decimal amount input while the user is typing. */
export function normalizeAmountInput(raw: string, maxDecimals: number): string {
  let value = raw
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/[^\d.]/g, '');
  if (!value) return '';

  const firstDotIndex = value.indexOf('.');
  if (firstDotIndex >= 0) {
    value =
      value.slice(0, firstDotIndex + 1) +
      value.slice(firstDotIndex + 1).replace(/\./g, '');
  }

  if (value.startsWith('.')) {
    value = `0${value}`;
  }

  if (!value.includes('.') && /^0\d+$/.test(value)) {
    value = `0.${value.slice(1)}`;
  }

  const hasTrailingDot = value.endsWith('.');
  const [rawWhole = '0', rawFraction = ''] = value.split('.');
  let whole = rawWhole.replace(/^0+(?=\d)/, '');
  if (!whole) whole = '0';

  const fraction = rawFraction.slice(0, maxDecimals);
  if (hasTrailingDot && fraction.length === 0) {
    return `${whole}.`;
  }

  return fraction ? `${whole}.${fraction}` : whole;
}

/** Tidy amount display on blur, Max, or before submit. */
export function finalizeAmountInput(raw: string, maxDecimals: number): string {
  const normalized = normalizeAmountInput(raw, maxDecimals);
  if (!normalized) return '';
  if (normalized.endsWith('.')) return normalized.slice(0, -1);

  if (!normalized.includes('.')) {
    return normalized;
  }

  const [whole, fraction] = normalized.split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}
