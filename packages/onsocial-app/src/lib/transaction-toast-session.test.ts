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

  it('matches App access CTA while the wallet sheet is open', () => {
    expect(sessionPendingFeedback('wallet')).toEqual({
      type: 'pending',
      pendingPhase: 'wallet',
      eyebrow: 'Wallet',
      msg: txToastSession.allowAccess,
    });
    expect(txToastSession.allowAccess).toBe('Allow access…');
  });

  it('switches the body after the wallet returns', () => {
    expect(sessionPendingFeedback('confirming')).toEqual({
      type: 'pending',
      pendingPhase: 'chain',
      eyebrow: 'Confirming',
      msg: txToastSession.finishingSession,
    });
    expect(sessionPendingFeedback('confirming').msg).not.toBe(
      txToastSession.allowAccess
    );
  });

  it('keeps the ready line free of chain jargon', () => {
    expect(txToastSession.ready).toBe("You're set to post.");
    expect(txToastSession.ready.toLowerCase()).not.toContain('on-chain');
  });
});
