import {
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { formatNearCompact } from '@/lib/format-near-balance';

export type DaoProposeBondGate = {
  canPropose: boolean;
  bondOk: boolean;
  needsStake: boolean;
  needsForeignStake: boolean;
  foreignStakeTokenLabel: string | null;
  bondLabel: string | null;
  nearLabel: string | null;
  shortfallNearLabel: string | null;
  canSubmit: boolean;
};

/**
 * Gate a DAO `add_proposal` confirm hug — this DAO's policy + spendable NEAR.
 * SOCIAL stake only when the DAO has a Member path and staking contract.
 */
export function resolveDaoProposeBondGate(
  eligibility: ProtocolGovernanceEligibility | null,
  loading = false,
  opts?: {
    /** Override propose right (e.g. ChangeConfig needs `canChangeConfig`). */
    canPropose?: boolean;
    /**
     * When false, never nudge Stake — used when the missing right is a Group
     * permission stake cannot unlock (e.g. `config:AddProposal`).
     */
    allowStakeUnlock?: boolean;
    /** How many `add_proposal` bonds this submit deposits (same-tx batch). */
    bondCount?: number;
  }
): DaoProposeBondGate {
  if (loading || !eligibility) {
    return {
      canPropose: false,
      bondOk: false,
      needsStake: false,
      needsForeignStake: false,
      foreignStakeTokenLabel: null,
      bondLabel: null,
      nearLabel: null,
      shortfallNearLabel: null,
      canSubmit: false,
    };
  }

  const bondCount = Math.max(1, Math.floor(opts?.bondCount ?? 1));
  const unitBond = BigInt(eligibility.proposalBond || '0');
  const bond = unitBond * BigInt(bondCount);
  const near = BigInt(eligibility.nearBalance || '0');
  const bondOk = near >= bond;
  const shortfall = bond > near ? bond - near : 0n;
  const canPropose =
    opts?.canPropose ?? viewerCanProposeOnDao(eligibility);
  const allowStakeUnlock = opts?.allowStakeUnlock !== false;
  const unitLabel = `${formatNearCompact(unitBond)} NEAR`;
  const bondLabel =
    bondCount > 1
      ? `${formatNearCompact(bond)} NEAR (${bondCount}× ${unitLabel})`
      : unitLabel;

  return {
    canPropose,
    bondOk,
    needsStake:
      allowStakeUnlock && !canPropose && eligibility.hasStakeProposePath,
    needsForeignStake:
      allowStakeUnlock &&
      !canPropose &&
      Boolean(eligibility.foreignStakeTokenLabel),
    foreignStakeTokenLabel: eligibility.foreignStakeTokenLabel ?? null,
    bondLabel,
    nearLabel: `${formatNearCompact(near)} NEAR`,
    shortfallNearLabel:
      shortfall > 0n ? `${formatNearCompact(shortfall)} NEAR` : null,
    canSubmit: canPropose && bondOk,
  };
}
