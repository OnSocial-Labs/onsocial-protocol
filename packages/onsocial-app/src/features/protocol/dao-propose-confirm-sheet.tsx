'use client';

import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  osActionDrawerConfirmBodyClassName,
  osActionDrawerConfirmClassName,
} from '@onsocial/ui';
import { DISCARD_CONFIRM_Z } from '@onsocial/ui';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import { resolveDaoProposeBondGate } from '@/features/protocol/dao-propose-confirm';

/**
 * Hug confirm before DAO `add_proposal` — bond + eligibility, then Propose / Discard.
 */
export function DaoProposeConfirmSheet({
  open,
  title,
  body,
  eligibility,
  eligibilityLoading = false,
  pending = false,
  proposeLabel = 'Propose',
  discardLabel = 'Discard',
  stakeLabel = 'Stake to propose',
  zIndex = DISCARD_CONFIRM_Z,
  onDiscard,
  onPropose,
  onStake,
}: {
  open: boolean;
  title: string;
  body: string;
  eligibility: ProtocolGovernanceEligibility | null;
  eligibilityLoading?: boolean;
  pending?: boolean;
  proposeLabel?: string;
  discardLabel?: string;
  stakeLabel?: string;
  zIndex?: number;
  onDiscard: () => void;
  onPropose: () => void;
  onStake?: () => void;
}) {
  const gate = resolveDaoProposeBondGate(eligibility, eligibilityLoading);
  const loading = eligibilityLoading && !eligibility;

  let detail: string;
  if (loading) {
    detail = 'Checking propose rights and bond…';
  } else if (gate.needsStake) {
    detail = gate.bondLabel
      ? `Stake enough SOCIAL to propose. Bond ${gate.bondLabel} on submit.`
      : 'Stake enough SOCIAL to propose on this DAO.';
  } else if (!gate.bondOk) {
    detail = gate.shortfallNearLabel
      ? `Need ${gate.shortfallNearLabel} more spendable NEAR for the ${gate.bondLabel} bond.`
      : `Need ${gate.bondLabel ?? 'the proposal bond'} in spendable NEAR.`;
  } else {
    detail = gate.bondLabel
      ? `Bond ${gate.bondLabel} on submit${
          gate.nearLabel ? ` · wallet ${gate.nearLabel}` : ''
        }.`
      : 'Ready to submit.';
  }

  return (
    <OsHugSheet
      open={open}
      onClose={onDiscard}
      chrome="choice"
      label={title}
      closeAriaLabel={discardLabel}
      backdropLabel={discardLabel}
      zIndex={zIndex}
    >
      <div className={osActionDrawerConfirmClassName}>
        <p className={osActionDrawerConfirmBodyClassName}>{body}</p>
        <p className={osActionDrawerConfirmBodyClassName}>{detail}</p>
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="danger"
            ready={!pending}
            disabled={pending}
            onClick={onDiscard}
          >
            {discardLabel}
          </OsSheetAction>
          {gate.needsStake && onStake ? (
            <OsSheetAction
              type="button"
              variant="primary"
              ready={!pending && !loading}
              disabled={pending || loading}
              pending={pending}
              onClick={onStake}
            >
              {stakeLabel}
            </OsSheetAction>
          ) : (
            <OsSheetAction
              type="button"
              variant="primary"
              ready={!pending && gate.canSubmit}
              disabled={pending || loading || !gate.canSubmit}
              pending={pending}
              pendingLabel="Submitting…"
              onClick={onPropose}
            >
              {proposeLabel}
            </OsSheetAction>
          )}
        </OsSheetActions>
      </div>
    </OsHugSheet>
  );
}
