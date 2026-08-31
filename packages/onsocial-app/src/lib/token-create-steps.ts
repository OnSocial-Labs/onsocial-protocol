export type TokenCreateStepId =
  | 'account'
  | 'fund'
  | 'contract'
  | 'mint'
  | 'lock';

export type TokenCreatePhase =
  | 'idle'
  | 'signing'
  | 'confirming'
  | 'success'
  | 'error';

export type TokenCreateStepState = 'idle' | 'spinning' | 'done' | 'failed';

export interface TokenCreateStep {
  id: TokenCreateStepId;
  label: string;
}

const BASE_STEPS: TokenCreateStep[] = [
  { id: 'account', label: 'Account' },
  { id: 'fund', label: 'Fund' },
  { id: 'contract', label: 'Contract' },
  { id: 'mint', label: 'Mint' },
];

const LOCK_STEP: TokenCreateStep = { id: 'lock', label: 'Lock' };

export function tokenCreateSteps(includeLock: boolean): TokenCreateStep[] {
  return includeLock ? [...BASE_STEPS, LOCK_STEP] : BASE_STEPS;
}

/**
 * Honest batch progress: one in-flight circle while the single tx is
 * pending. NEAR does not report live per-action pulses — and on error the
 * whole batch reverted, so no step is marked failed individually.
 */
export function resolveTokenCreateStepStates(
  phase: TokenCreatePhase,
  includeLock: boolean
): Array<TokenCreateStep & { state: TokenCreateStepState }> {
  const steps = tokenCreateSteps(includeLock);
  return steps.map((step, index) => {
    if (phase === 'success') {
      return { ...step, state: 'done' };
    }
    if (phase === 'error') {
      // Atomic batch: nothing committed — no per-step blame.
      return { ...step, state: 'idle' };
    }
    if ((phase === 'signing' || phase === 'confirming') && index === 0) {
      return { ...step, state: 'spinning' };
    }
    return { ...step, state: 'idle' };
  });
}
