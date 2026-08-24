import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import { formatNearCompact } from '@/lib/format-near-balance';
import { formatSocialCompact } from '@/lib/format-social-balance';

export function ProtocolStakeFacts({
  eligibility,
}: {
  eligibility: ProtocolGovernanceEligibility;
}) {
  return (
    <dl className="protocol-action-facts protocol-stake-facts">
      <div>
        <dt>Propose threshold</dt>
        <dd>{formatSocialCompact(eligibility.requiredWeight)} SOCIAL</dd>
      </div>
      <div>
        <dt>Delegated</dt>
        <dd>
          {formatSocialCompact(eligibility.delegatedWeight)} SOCIAL
          {eligibility.canPropose ? ' · met' : ''}
        </dd>
      </div>
      <div>
        <dt>Staked</dt>
        <dd>{formatSocialCompact(eligibility.availableToDelegate)} SOCIAL</dd>
      </div>
      <div>
        <dt>Wallet</dt>
        <dd>{formatSocialCompact(eligibility.walletBalance)} SOCIAL</dd>
      </div>
      <div className="protocol-stake-facts-span">
        <dt>NEAR</dt>
        <dd>{formatNearCompact(eligibility.nearBalance)} spendable</dd>
      </div>
    </dl>
  );
}
