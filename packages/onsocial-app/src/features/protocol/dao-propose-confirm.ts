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
  loading = false
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

  const bond = BigInt(eligibility.proposalBond || '0');
  const near = BigInt(eligibility.nearBalance || '0');
  const bondOk = near >= bond;
  const shortfall = bond > near ? bond - near : 0n;
  const canPropose = viewerCanProposeOnDao(eligibility);

  return {
    canPropose,
    bondOk,
    needsStake: !canPropose && eligibility.hasStakeProposePath,
    needsForeignStake:
      !canPropose && Boolean(eligibility.foreignStakeTokenLabel),
    foreignStakeTokenLabel: eligibility.foreignStakeTokenLabel ?? null,
    bondLabel: `${formatNearCompact(bond)} NEAR`,
    nearLabel: `${formatNearCompact(near)} NEAR`,
    shortfallNearLabel:
      shortfall > 0n ? `${formatNearCompact(shortfall)} NEAR` : null,
    canSubmit: canPropose && bondOk,
  };
}
