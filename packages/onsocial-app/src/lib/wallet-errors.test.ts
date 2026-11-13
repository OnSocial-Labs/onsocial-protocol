import { describe, expect, it } from 'vitest';
import { txToastError } from '@/lib/transaction-toast-copy';
import { mapAppAccessError } from '@/lib/wallet-errors';

describe('mapAppAccessError', () => {
  it('stays quiet when the person cancels', () => {
    expect(
      mapAppAccessError(
        new Error('User rejected the transaction'),
        txToastError.allowAppAccessFailed
      )
    ).toBeNull();
    expect(
      mapAppAccessError('user cancelled', txToastError.allowAppAccessFailed)
    ).toBeNull();
  });

  it('returns the glossary line instead of gas or on-chain wallet text', () => {
    const cases = [
      new Error('Exceeded the prepaid gas at execute_admin'),
      new Error('on-chain contract rejected the function call'),
      new Error('not enough yoctoNEAR for gas'),
      'Server error: on chain failure',
    ];
    for (const error of cases) {
      const raw = error instanceof Error ? error.message : error;
      const allow = mapAppAccessError(error, txToastError.allowAppAccessFailed);
      const remove = mapAppAccessError(
        error,
        txToastError.removeAppAccessFailed
      );
      expect(allow).toBe(txToastError.allowAppAccessFailed);
      expect(remove).toBe(txToastError.removeAppAccessFailed);
      expect(allow).not.toContain(raw);
      expect(remove).not.toContain(raw);
    }
  });
});
