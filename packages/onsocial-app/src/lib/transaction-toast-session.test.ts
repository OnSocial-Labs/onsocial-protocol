import { describe, expect, it } from 'vitest';
import {
  sessionPendingFeedback,
  txToastSession,
} from '@/lib/transaction-toast-copy';

describe('session pending toast', () => {
  it('uses the setup line only while the gift is in flight', () => {
    expect(sessionPendingFeedback('setup')).toEqual({
      type: 'pending',
      pendingPhase: 'chain',
      eyebrow: 'Confirming',
      msg: txToastSession.settingUpSession,
    });
  });

  it('asks for the wallet while the key sheet is open', () => {
    expect(sessionPendingFeedback('wallet')).toEqual({
      type: 'pending',
      pendingPhase: 'wallet',
      eyebrow: 'Wallet',
      msg: txToastSession.approveInWallet,
    });
  });

  it('keeps the approval line after the wallet returns', () => {
    expect(sessionPendingFeedback('confirming')).toEqual({
      type: 'pending',
      pendingPhase: 'chain',
      eyebrow: 'Confirming',
      msg: txToastSession.approveInWallet,
    });
    expect(sessionPendingFeedback('confirming').msg).not.toBe(
      txToastSession.settingUpSession
    );
  });

  it('keeps the green line for a ready session', () => {
    expect(txToastSession.ready).toBe("You're set to post on-chain.");
  });
});
