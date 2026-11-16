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

  it('keeps cancel soft and recoverable', () => {
    expect(txToastSession.canceled).toBe('Session not finished.');
    expect(txToastSession.failed).toBe('Session setup did not finish.');
    expect(txToastSession.timedOut).toBe('The wallet took too long.');
    expect(txToastSession.tryAgain).toBe('Try again');
    expect(txToastSession.canceled.toLowerCase()).not.toContain('fail');
    expect(txToastSession.timedOut.toLowerCase()).not.toContain('try again');
  });
});
