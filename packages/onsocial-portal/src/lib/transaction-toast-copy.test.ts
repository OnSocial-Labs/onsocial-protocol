import { describe, expect, it } from 'vitest';

import {
  txToastPending,
  txToastSuccess,
  TX_TOAST_EYEBROW,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';

describe('transaction-toast-copy', () => {
  it('uses minimal SOCIAL-forward pending and success lines', () => {
    expect(txToastPending.collectingSocial).toBe('Collecting SOCIAL…');
    expect(txToastSuccess.socialCollected).toBe('SOCIAL collected.');
    expect(txToastSuccess.joinedRally('Season Two')).toBe(
      "You're in Season Two. Rally badge on your profile."
    );
    expect(txToastSuccess.joinedRally('Genesis Rally', 'Genesis')).toBe(
      "You're in Genesis Rally. Genesis badge on your profile."
    );
  });

  it('uses short confirming eyebrows', () => {
    expect(TX_TOAST_EYEBROW.confirming).toBe('Confirming');
    expect(TX_TOAST_EYEBROW.wallet).toBe('Wallet');
  });

  it('uses formal governance pending and success lines', () => {
    expect(txToastGovPending.submittingProposal).toBe('Submitting proposal…');
    expect(txToastGovSuccess.actionConfirmed('approval vote')).toBe(
      'approval vote confirmed.'
    );
  });
});
