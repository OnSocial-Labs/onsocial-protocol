'use client';

import type { ProtocolDaoBoostInfraContext } from '@/lib/protocol-dao-boost-infra';
import { useNearAccountStatus } from '@/hooks/use-near-account-status';
import {
  formatProtocolComposeMaxAmount,
  ProtocolComposeAmountField,
} from '@/features/protocol/protocol-compose-amount-field';
import { ProtocolComposeNearAccountField } from '@/features/protocol/protocol-compose-near-account-field';

export function ProtocolComposeWithdrawBoostFields({
  formId,
  boostInfraContext,
  boostInfraLoading,
  amountSocial,
  onAmountChange,
  pending = false,
  blocked = false,
}: {
  formId: string;
  boostInfraContext: ProtocolDaoBoostInfraContext | null;
  boostInfraLoading: boolean;
  amountSocial: string;
  onAmountChange: (value: string) => void;
  pending?: boolean;
  /** DAO cannot withdraw from infra under current chain state. */
  blocked?: boolean;
}) {
  const receiverId = boostInfraContext?.defaultReceiverId ?? '';
  const receiverStatus = useNearAccountStatus(receiverId);

  if (boostInfraLoading && !boostInfraContext) {
    return (
      <p className="protocol-compose-note">Loading boost infra…</p>
    );
  }

  const disabled =
    pending ||
    boostInfraLoading ||
    blocked ||
    !boostInfraContext?.canWithdrawBoostInfra;

  return (
    <div className="protocol-compose-withdraw-boost-fields">
      <ProtocolComposeAmountField
        label="Amount"
        value={amountSocial}
        onValueChange={onAmountChange}
        disabled={disabled}
        clampInputToMax
        maxYocto={boostInfraContext?.infraPoolYocto ?? '0'}
        maxDisabled={
          boostInfraLoading || !boostInfraContext?.canWithdrawBoostInfra
        }
        meta={
          boostInfraContext
            ? `Infra pool ${formatProtocolComposeMaxAmount(
                boostInfraContext.infraPoolYocto
              )} SOCIAL`
            : undefined
        }
      />
      {receiverId ? (
        <ProtocolComposeNearAccountField
          id={`${formId}-withdraw-boost-to`}
          label="To"
          value={receiverId}
          status={receiverStatus}
          onValueChange={() => {}}
          readOnly
          disabled={disabled}
          requireOnChain={false}
        />
      ) : null}
    </div>
  );
}
