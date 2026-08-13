import { describe, expect, it } from 'vitest';
import {
  buildFtContractAccountId,
  defaultFtIconDataUrl,
  getFtContractAccountError,
  getFtSubaccountLabelError,
  normalizeFtSubaccountLabel,
  parseFtSupplySmallest,
} from '@/lib/app-create-token';

describe('app-create-token', () => {
  it('normalizes flexible subaccount labels', () => {
    expect(normalizeFtSubaccountLabel(' Cool Token ')).toBe('cool-token');
    expect(normalizeFtSubaccountLabel('my_ft')).toBe('my_ft');
  });

  it('builds contract ids under the parent', () => {
    expect(buildFtContractAccountId('alice.near', 'cool')).toBe(
      'cool.alice.near'
    );
    expect(buildFtContractAccountId('alice.near', 'token')).toBe(
      'token.alice.near'
    );
  });

  it('rejects invalid labels', () => {
    expect(getFtSubaccountLabelError('a')).toMatch(/at least/i);
    expect(getFtContractAccountError('alice.near', 'cool')).toBe('');
  });

  it('parses human supply to 18 decimals', () => {
    expect(parseFtSupplySmallest('1')).toBe('1000000000000000000');
    expect(parseFtSupplySmallest('0')).toBeNull();
    expect(parseFtSupplySmallest('')).toBeNull();
  });

  it('builds a small default icon', () => {
    const icon = defaultFtIconDataUrl('ab');
    expect(icon.startsWith('data:image/svg+xml,')).toBe(true);
    expect(icon.length).toBeLessThan(800);
  });
});
