import { describe, expect, it } from 'vitest';
import {
  sessionPendingFeedback,
  txToastSession,
} from './transaction-toast-copy';

describe('session pending toast', () => {
  it('keeps one pending body across setup, wallet, and confirming', () => {
    const line = txToastSession.settingUpSession;
    expect(sessionPendingFeedback('setup')).toEqual({
      type: 'pending',
      pendingPhase: 'chain',
      eyebrow: 'Confirming',
      msg: line,
    });
    expect(sessionPendingFeedback('wallet')).toEqual({
      type: 'pending',
      pendingPhase: 'wallet',
      eyebrow: 'Wallet',
      msg: line,
    });
    expect(sessionPendingFeedback('confirming')).toEqual({
      type: 'pending',
      pendingPhase: 'chain',
      eyebrow: 'Confirming',
      msg: line,
    });
  });

  it('keeps the ready line free of chain jargon', () => {
    expect(txToastSession.ready).toBe("You're set to post.");
    expect(txToastSession.ready.toLowerCase()).not.toContain('on-chain');
  });
});
