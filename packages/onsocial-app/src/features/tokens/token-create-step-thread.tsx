'use client';

import { PulsingDots } from '@onsocial/ui';
import type {
  TokenCreatePhase,
  TokenCreateStepState,
} from '@/lib/token-create-steps';
import { resolveTokenCreateStepStates } from '@/lib/token-create-steps';

function StepCircle({ state }: { state: TokenCreateStepState }) {
  if (state === 'spinning') {
    return (
      <span className="token-create-step-circle is-spinning" aria-hidden>
        <PulsingDots size="sm" className="token-create-step-dots" />
      </span>
    );
  }
  return (
    <span
      className={`token-create-step-circle is-${state}`}
      aria-hidden
    />
  );
}

export function TokenCreateStepThread({
  phase,
  includeLock,
}: {
  phase: TokenCreatePhase;
  includeLock: boolean;
}) {
  const steps = resolveTokenCreateStepStates(phase, includeLock);
  const label =
    phase === 'signing'
      ? 'Sign in your wallet'
      : phase === 'confirming'
        ? 'Confirming the batch'
        : phase === 'success'
          ? 'Token is live'
          : phase === 'error'
            ? 'Batch stopped'
            : 'One signature';

  return (
    <ol className="token-create-step-thread" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.id} className="token-create-step">
          {index > 0 ? (
            <span className="token-create-step-rail" aria-hidden />
          ) : null}
          <StepCircle state={step.state} />
          <span className="token-create-step-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
