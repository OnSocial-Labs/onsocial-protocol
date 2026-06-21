import { describe, expect, it } from 'vitest';
import {
  getBoundedNoteFieldCounter,
  isBoundedNoteReady,
  POLICY_PROPOSAL_DESCRIPTION_LIMITS,
  resolveBoundedNoteSubmitBlocker,
} from '@/lib/bounded-note-field';

describe('policy proposal descriptions', () => {
  it('accepts auto-generated governance copy', () => {
    const samples = [
      'Updates delegated_proposers: allows Function call, Join, and Leave.',
      'Set proposal bond 0.1 NEAR · period 7d.',
      'Adds moderators (≥500 SOCIAL): Signal, Transfer.',
      'Send 10 SOCIAL → @bob.testnet',
    ];

    for (const sample of samples) {
      expect(
        isBoundedNoteReady(sample, POLICY_PROPOSAL_DESCRIPTION_LIMITS)
      ).toBe(true);
    }
  });

  it('returns a short submit blocker for under-min descriptions', () => {
    expect(
      resolveBoundedNoteSubmitBlocker(
        'Short',
        POLICY_PROPOSAL_DESCRIPTION_LIMITS
      )
    ).toBeNull();
  });

  it('surfaces invalid characters in the field counter', () => {
    const counter = getBoundedNoteFieldCounter(
      'Hello 👋 world',
      POLICY_PROPOSAL_DESCRIPTION_LIMITS
    );

    expect(counter.invalidCharacters).toBe(true);
    expect(counter.className).toBe('portal-red-text');
    expect(counter.label).toBe('Invalid character · 14 / 280');
  });

  it('prefixes under-min counters when invalid characters are present', () => {
    const counter = getBoundedNoteFieldCounter(
      'Hi 👋',
      POLICY_PROPOSAL_DESCRIPTION_LIMITS
    );

    expect(counter.label).toBe('Invalid character · 5 / 10 min');
  });
});
