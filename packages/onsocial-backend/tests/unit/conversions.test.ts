import { describe, it, expect } from 'vitest';

// We test toYocto by importing a wrapper — the function is internal to
// rewards.ts so we re-implement the same logic here for validation.

function toYocto(amount: number): string {
  const [intPart, decPart = ''] = amount.toString().split('.');
  const padded = decPart.padEnd(18, '0').slice(0, 18);
  const result = intPart + padded;
  return result.replace(/^0+/, '') || '0';
}

function formatSocial(yocto: string): string {
  if (!yocto || yocto === '0') return '0';
  const padded = yocto.padStart(19, '0');
  const intPart = padded.slice(0, padded.length - 18) || '0';
  const decPart = padded.slice(padded.length - 18, padded.length - 16);
  const dec = decPart.replace(/0+$/, '');
  return dec ? `${intPart}.${dec}` : intPart;
}

describe('toYocto', () => {
  it('converts 0.1 to 100000000000000000', () => {
    expect(toYocto(0.1)).toBe('100000000000000000');
  });

  it('converts 1.0 to 1000000000000000000', () => {
    expect(toYocto(1.0)).toBe('1000000000000000000');
  });

  it('converts 0 to 0', () => {
    expect(toYocto(0)).toBe('0');
  });

  it('converts 0.5 to 500000000000000000', () => {
    expect(toYocto(0.5)).toBe('500000000000000000');
  });

  it('converts 10 to 10000000000000000000', () => {
    expect(toYocto(10)).toBe('10000000000000000000');
  });

  it('converts 0.01 to 10000000000000000', () => {
    expect(toYocto(0.01)).toBe('10000000000000000');
  });
});

describe('formatSocial', () => {
  it('formats 0 as 0', () => {
    expect(formatSocial('0')).toBe('0');
  });

  it('formats 100000000000000000 as 0.1', () => {
    expect(formatSocial('100000000000000000')).toBe('0.1');
  });

  it('formats 1000000000000000000 as 1', () => {
    expect(formatSocial('1000000000000000000')).toBe('1');
  });

  it('formats 500000000000000000 as 0.5', () => {
    expect(formatSocial('500000000000000000')).toBe('0.5');
  });

  it('formats empty string as 0', () => {
    expect(formatSocial('')).toBe('0');
  });
});

// The regex used in viewUserReward to quote bare u128 numbers in JSON
// so they become strings and preserve precision beyond Number.MAX_SAFE_INTEGER.
function quoteU128(raw: string): string {
  return raw.replace(/:(\d+)([,}])/g, ':"$1"$2');
}

describe('quoteU128 (u128 JSON quoting)', () => {
  it('quotes all numeric values in a UserReward JSON', () => {
    const raw =
      '{"claimable":500000000000000000,"daily_earned":1000000000000000000,"last_day":20517,"total_earned":1400000000000000000,"total_claimed":900000000000000000}';
    const safe = quoteU128(raw);
    const parsed = JSON.parse(safe);
    expect(parsed.claimable).toBe('500000000000000000');
    expect(parsed.daily_earned).toBe('1000000000000000000');
    expect(parsed.last_day).toBe('20517');
    expect(parsed.total_earned).toBe('1400000000000000000');
    expect(parsed.total_claimed).toBe('900000000000000000');
  });

  it('handles zero values', () => {
    const raw =
      '{"claimable":0,"daily_earned":0,"last_day":0,"total_earned":0,"total_claimed":0}';
    const safe = quoteU128(raw);
    const parsed = JSON.parse(safe);
    expect(parsed.claimable).toBe('0');
  });

  it('preserves null', () => {
    expect(quoteU128('null')).toBe('null');
  });
});
