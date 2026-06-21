import { describe, expect, it } from 'vitest';

import { resolveSeasonZeroLifecyclePhase } from '@/features/season/season-zero-types';

function makeOnChain(
  overrides: Partial<{
    active: boolean;
    starts_at_ns: string;
    ends_at_ns: string;
    is_live: boolean;
    claim_open: boolean;
  }> = {}
) {
  const startsMs = 1_000;
  const endsMs = 2_000;
  return {
    label: 'Rally #4',
    active: true,
    starts_at_ns: String(startsMs * 1_000_000),
    ends_at_ns: String(endsMs * 1_000_000),
    is_live: false,
    claim_open: false,
    ...overrides,
  };
}

describe('resolveSeasonZeroLifecyclePhase', () => {
  it('returns upcoming before start time', () => {
    const phase = resolveSeasonZeroLifecyclePhase(
      makeOnChain({ is_live: false }),
      null,
      500
    );
    expect(phase).toBe('upcoming');
  });

  it('returns live at start when indexer has not flipped is_live yet', () => {
    const phase = resolveSeasonZeroLifecyclePhase(
      makeOnChain({ is_live: false }),
      null,
      1_500
    );
    expect(phase).toBe('live');
  });

  it('returns live when is_live is true regardless of clock', () => {
    const phase = resolveSeasonZeroLifecyclePhase(
      makeOnChain({ is_live: true }),
      null,
      500
    );
    expect(phase).toBe('live');
  });

  it('returns ended_pending_settlement after end when no settlement', () => {
    const phase = resolveSeasonZeroLifecyclePhase(
      makeOnChain({ is_live: false }),
      null,
      2_500
    );
    expect(phase).toBe('ended_pending_settlement');
  });

  it('does not treat in-window season as live when claim_open is true', () => {
    const phase = resolveSeasonZeroLifecyclePhase(
      makeOnChain({ is_live: false, claim_open: true }),
      null,
      1_500
    );
    expect(phase).toBe('ended_pending_settlement');
  });
});
