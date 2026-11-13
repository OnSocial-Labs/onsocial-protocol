import { describe, expect, it } from 'vitest';
import { txToastError } from '@/lib/transaction-toast-copy';
import { mapAppAccessError } from '@/lib/wallet-errors';

const JARGON = /\b(gas|tgas|on-chain|on chain|contract|yocto|execute_admin)\b/i;

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

  it('never shows gas or on-chain text from the wallet', () => {
    const cases = [
      new Error('Exceeded the prepaid gas at execute_admin'),
      new Error('on-chain contract rejected the function call'),
      new Error('not enough yoctoNEAR for gas'),
      'Server error: on chain failure',
    ];
    for (const error of cases) {
      const allow = mapAppAccessError(error, txToastError.allowAppAccessFailed);
      const remove = mapAppAccessError(
        error,
        txToastError.removeAppAccessFailed
      );
      expect(allow).toBe(txToastError.allowAppAccessFailed);
      expect(remove).toBe(txToastError.removeAppAccessFailed);
      expect(allow).not.toMatch(JARGON);
      expect(remove).not.toMatch(JARGON);
      expect(String(allow)).not.toContain('execute_admin');
    }
  });

  it('replaces a fallback that itself contains chain jargon', () => {
    expect(mapAppAccessError(new Error('nope'), 'out of gas on-chain')).toBe(
      "Couldn't add app access. Try again in a moment."
    );
  });
});
