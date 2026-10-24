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
  | 'locking'
  | 'lockError'
  | 'success'
  | 'error'
  | 'finishError';

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
 * Signing is the wallet account create. Confirming is the factory install.
 * A wallet failure leaves every step idle. A factory failure keeps the
 * funded account and marks the contract step failed.
 */
export function resolveTokenCreateStepStates(
  phase: TokenCreatePhase,
  includeLock: boolean
): Array<TokenCreateStep & { state: TokenCreateStepState }> {
  const steps = tokenCreateSteps(includeLock);
  return steps.map((step) => {
    if (phase === 'success') {
      return { ...step, state: 'done' };
    }
    if (phase === 'error') {
      return { ...step, state: 'idle' };
    }
    if (phase === 'finishError') {
      if (step.id === 'account' || step.id === 'fund') {
        return { ...step, state: 'done' };
      }
      if (step.id === 'contract') return { ...step, state: 'failed' };
      return { ...step, state: 'idle' };
    }
    if (phase === 'signing') {
      return { ...step, state: step.id === 'account' ? 'spinning' : 'idle' };
    }
    if (phase === 'confirming') {
      if (step.id === 'account' || step.id === 'fund') {
        return { ...step, state: 'done' };
      }
      if (step.id === 'contract') return { ...step, state: 'spinning' };
      return { ...step, state: 'idle' };
    }
    if (phase === 'locking') {
      if (step.id === 'lock') return { ...step, state: 'spinning' };
      return { ...step, state: 'done' };
    }
    if (phase === 'lockError') {
      if (step.id === 'lock') return { ...step, state: 'failed' };
      return { ...step, state: 'done' };
    }
    return { ...step, state: 'idle' };
  });
}
