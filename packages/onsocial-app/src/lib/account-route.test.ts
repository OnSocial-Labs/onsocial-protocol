import { describe, expect, it } from 'vitest';
import { normalizeAccountRoute } from './account-route';

describe('normalizeAccountRoute', () => {
  it('returns the account id for @-prefixed routes', () => {
    expect(normalizeAccountRoute('@greenghost.testnet')).toBe(
      'greenghost.testnet'
    );
  });

  it('returns null when the route is missing the @ prefix', () => {
    expect(normalizeAccountRoute('greenghost.testnet')).toBeNull();
  });

  it('returns null when the route does not include an account id', () => {
    expect(normalizeAccountRoute('@')).toBeNull();
  });

  it('decodes and trims the route segment', () => {
    expect(normalizeAccountRoute('%40alice.testnet%20')).toBe('alice.testnet');
  });
});
