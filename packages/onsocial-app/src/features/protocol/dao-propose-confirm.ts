import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import { formatNearCompact } from '@/lib/format-near-balance';

export type DaoProposeBondGate = {
  canPropose: boolean;
  bondOk: boolean;
  needsStake: boolean;
  bondLabel: string | null;
  nearLabel: string | null;
  shortfallNearLabel: string | null;
  canSubmit: boolean;
};

/**
 * Gate a DAO `add_proposal` confirm hug — propose rights + spendable NEAR for bond.
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

  return {
    canPropose: eligibility.canPropose,
    bondOk,
    needsStake: !eligibility.canPropose,
    bondLabel: `${formatNearCompact(bond)} NEAR`,
    nearLabel: `${formatNearCompact(near)} NEAR`,
    shortfallNearLabel:
      shortfall > 0n ? `${formatNearCompact(shortfall)} NEAR` : null,
    canSubmit: eligibility.canPropose && bondOk,
  };
}
