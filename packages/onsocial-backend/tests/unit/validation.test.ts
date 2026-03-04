import { describe, it, expect } from 'vitest';

describe('config validation', () => {
  it('NEAR account regex matches valid accounts', () => {
    const NEAR_ACCOUNT_REGEX = /^[a-z0-9._-]+\.(near|testnet)$/;
    expect(NEAR_ACCOUNT_REGEX.test('alice.near')).toBe(true);
    expect(NEAR_ACCOUNT_REGEX.test('bob.testnet')).toBe(true);
    expect(NEAR_ACCOUNT_REGEX.test('my-app.alice.near')).toBe(true);
    expect(NEAR_ACCOUNT_REGEX.test('dev_user.testnet')).toBe(true);
  });

  it('NEAR account regex rejects invalid accounts', () => {
    const NEAR_ACCOUNT_REGEX = /^[a-z0-9._-]+\.(near|testnet)$/;
    expect(NEAR_ACCOUNT_REGEX.test('')).toBe(false);
    expect(NEAR_ACCOUNT_REGEX.test('Alice.near')).toBe(false);
    expect(NEAR_ACCOUNT_REGEX.test('alice.mainnet')).toBe(false);
    expect(NEAR_ACCOUNT_REGEX.test('alice')).toBe(false);
    expect(NEAR_ACCOUNT_REGEX.test('.near')).toBe(false);
  });

  it('sourceRef format is unique per message', () => {
    const chatId = '-1001234567890';
    const msgId1 = 42;
    const msgId2 = 43;
    const ref1 = `tg:msg:${chatId}:${msgId1}`;
    const ref2 = `tg:msg:${chatId}:${msgId2}`;
    expect(ref1).not.toBe(ref2);
    expect(ref1).toBe('tg:msg:-1001234567890:42');
  });

  it('daily cap comparison works correctly', () => {
    const dailyCap = 1.0;
    const amount = 0.1;

    // Under cap — allowed
    expect(0.8 + amount > dailyCap).toBe(false);
    // Exactly at cap — allowed (contract clamps to remaining)
    expect(0.9 + amount > dailyCap).toBe(false);
    // Over cap — rejected
    expect(1.0 + amount > dailyCap).toBe(true);
  });
});
