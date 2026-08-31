import { describe, expect, it } from 'vitest';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { buildThankTokenActions } from '@/lib/app-thank-token-transactions';
import {
  THANK_TOKEN_MEMO,
  THANK_TOKEN_RECIPIENT_CAP,
  THANK_TOKEN_STORAGE_FLOOR_YOCTO,
  formatThankAmount,
  getThankAmountError,
  getThankBalanceError,
  getThankNearError,
  getThankRecipientError,
  isThankStorageRegistered,
  normalizeThankRecipientIds,
  parseThankAmountSmallest,
  resolveThankStorageDeposit,
  thankStorageNearYocto,
  thankTotalSmallest,
  toggleThankRecipient,
} from '@/lib/app-thank-token';

const SENDER =
  ACTIVE_NEAR_NETWORK === 'mainnet' ? 'alice.near' : 'alice.testnet';
const BOB = ACTIVE_NEAR_NETWORK === 'mainnet' ? 'bob.near' : 'bob.testnet';
const CARA = ACTIVE_NEAR_NETWORK === 'mainnet' ? 'cara.near' : 'cara.testnet';

describe('app-thank-token', () => {
  it('drops the sender, duplicates, and invalid ids', () => {
    expect(
      normalizeThankRecipientIds(
        [BOB, ` ${BOB.toUpperCase()} `, SENDER, 'x', '', CARA],
        SENDER
      )
    ).toEqual([BOB, CARA]);
  });

  it('toggles a stander and blocks the 11th pick', () => {
    const first = toggleThankRecipient([], BOB, SENDER);
    expect(first).toEqual({ next: [BOB], blocked: false });
    expect(toggleThankRecipient(first.next, BOB, SENDER)).toEqual({
      next: [],
      blocked: false,
    });

    const filled = Array.from({ length: THANK_TOKEN_RECIPIENT_CAP }, (_, i) =>
      ACTIVE_NEAR_NETWORK === 'mainnet' ? `u${i}.near` : `u${i}.testnet`
    );
    const blocked = toggleThankRecipient(filled, CARA, SENDER);
    expect(blocked.blocked).toBe(true);
    expect(blocked.next).toEqual(filled);
  });

  it('parses the same 18-decimal amount as create', () => {
    expect(parseThankAmountSmallest('1')).toBe('1000000000000000000');
    expect(parseThankAmountSmallest('0')).toBeNull();
    expect(getThankAmountError('')).toBe('');
    expect(getThankAmountError('0')).toMatch(/greater than zero/i);
    expect(formatThankAmount('1500000000000000000')).toBe('1.5');
  });

  it('requires a stander and caps the batch', () => {
    expect(getThankRecipientError([], SENDER)).toMatch(/stands with you/i);
    expect(getThankRecipientError([SENDER], SENDER)).toMatch(
      /stands with you/i
    );
    const tooMany = Array.from(
      { length: THANK_TOKEN_RECIPIENT_CAP + 1 },
      (_, i) =>
        ACTIVE_NEAR_NETWORK === 'mainnet' ? `u${i}.near` : `u${i}.testnet`
    );
    expect(getThankRecipientError(tooMany, SENDER)).toMatch(/up to 10/i);
    expect(getThankRecipientError([BOB, CARA], SENDER)).toBe('');
  });

  it('checks token balance against the same amount × people', () => {
    expect(thankTotalSmallest('1000000000000000000', 3)).toBe(
      3000000000000000000n
    );
    expect(getThankBalanceError(5n, 3n, 'COOL')).toBe('');
    expect(getThankBalanceError(2n, 3n, 'COOL')).toBe('Not enough COOL.');
  });

  it('uses the contract storage min when it is above the NEP-141 floor', () => {
    expect(resolveThankStorageDeposit(null)).toBe(
      THANK_TOKEN_STORAGE_FLOOR_YOCTO
    );
    expect(resolveThankStorageDeposit('1')).toBe(
      THANK_TOKEN_STORAGE_FLOOR_YOCTO
    );
    expect(resolveThankStorageDeposit('2000000000000000000000')).toBe(
      '2000000000000000000000'
    );
    expect(isThankStorageRegistered(null)).toBe(false);
    expect(isThankStorageRegistered({ total: '0' })).toBe(false);
    expect(isThankStorageRegistered({ total: '1' })).toBe(true);
  });

  it('asks for NEAR only when new wallets need registration', () => {
    const deposit = THANK_TOKEN_STORAGE_FLOOR_YOCTO;
    expect(thankStorageNearYocto(2, deposit)).toBe(BigInt(deposit) * 2n);
    expect(getThankNearError(10n ** 24n, 2, deposit)).toBe('');
    expect(getThankNearError(0n, 2, deposit)).toMatch(/NEAR/i);
    expect(getThankNearError(10n ** 24n, 0, deposit)).toBe('');
  });
});

describe('buildThankTokenActions', () => {
  it('registers then transfers per person', () => {
    const actions = buildThankTokenActions({
      senderId: SENDER,
      amountSmallest: '1000000000000000000',
      storageDepositYocto: THANK_TOKEN_STORAGE_FLOOR_YOCTO,
      recipients: [
        { accountId: BOB, needsStorage: true },
        { accountId: CARA, needsStorage: false },
      ],
    });

    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({
      type: 'FunctionCall',
      params: {
        methodName: 'storage_deposit',
        args: { account_id: BOB, registration_only: true },
        deposit: THANK_TOKEN_STORAGE_FLOOR_YOCTO,
      },
    });
    expect(actions[1]).toMatchObject({
      type: 'FunctionCall',
      params: {
        methodName: 'ft_transfer',
        args: {
          receiver_id: BOB,
          amount: '1000000000000000000',
          memo: THANK_TOKEN_MEMO,
        },
        deposit: '1',
      },
    });
    expect(actions[2]).toMatchObject({
      type: 'FunctionCall',
      params: {
        methodName: 'ft_transfer',
        args: { receiver_id: CARA },
      },
    });
  });

  it('stays under 300 TGas when every stander needs storage', () => {
    const recipients = Array.from(
      { length: THANK_TOKEN_RECIPIENT_CAP },
      (_, i) => ({
        accountId:
          ACTIVE_NEAR_NETWORK === 'mainnet' ? `u${i}.near` : `u${i}.testnet`,
        needsStorage: true,
      })
    );
    const actions = buildThankTokenActions({
      senderId: SENDER,
      amountSmallest: '1',
      storageDepositYocto: THANK_TOKEN_STORAGE_FLOOR_YOCTO,
      recipients,
    });
    const gas = actions.reduce((sum, action) => {
      if (action.type !== 'FunctionCall') return sum;
      return sum + BigInt(action.params.gas);
    }, 0n);
    expect(actions).toHaveLength(THANK_TOKEN_RECIPIENT_CAP * 2);
    expect(gas).toBeLessThan(300_000_000_000_000n);
  });

  it('refuses an empty or oversized batch', () => {
    expect(() =>
      buildThankTokenActions({
        senderId: SENDER,
        amountSmallest: '1',
        storageDepositYocto: THANK_TOKEN_STORAGE_FLOOR_YOCTO,
        recipients: [],
      })
    ).toThrow(/stands with you/i);

    const tooMany = Array.from(
      { length: THANK_TOKEN_RECIPIENT_CAP + 1 },
      (_, i) => ({
        accountId:
          ACTIVE_NEAR_NETWORK === 'mainnet' ? `u${i}.near` : `u${i}.testnet`,
        needsStorage: false,
      })
    );
    expect(() =>
      buildThankTokenActions({
        senderId: SENDER,
        amountSmallest: '1',
        storageDepositYocto: THANK_TOKEN_STORAGE_FLOOR_YOCTO,
        recipients: tooMany,
      })
    ).toThrow(/up to 10/i);
  });
});
