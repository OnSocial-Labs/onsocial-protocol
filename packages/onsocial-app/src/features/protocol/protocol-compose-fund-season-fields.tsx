'use client';

import {
  ChoiceDrawerField,
  osFieldBorderedClassName,
  type ChoiceOption,
} from '@onsocial/ui';
import type { ProtocolDaoSocialSpendTreasuryContext } from '@/lib/protocol-dao-social-spend-treasury';
import {
  formatProtocolComposeMaxAmount,
  ProtocolComposeAmountField,
} from '@/features/protocol/protocol-compose-amount-field';

export function ProtocolComposeFundSeasonFields({
  socialSpendContext,
  socialSpendLoading,
  seasonId,
  onSeasonIdChange,
  amountSocial,
  onAmountChange,
  pending = false,
  zIndex,
}: {
  socialSpendContext: ProtocolDaoSocialSpendTreasuryContext | null;
  socialSpendLoading: boolean;
  seasonId: string;
  onSeasonIdChange: (seasonId: string) => void;
  amountSocial: string;
  onAmountChange: (value: string) => void;
  pending?: boolean;
  zIndex?: number;
}) {
  if (socialSpendLoading && !socialSpendContext) {
    return (
      <p className="protocol-compose-note">Loading rally treasury…</p>
    );
  }

  const fundableSeasonIds = socialSpendContext?.fundableSeasonIds ?? [];
  const balanceYocto = socialSpendContext?.daoSocialBalanceYocto ?? '0';
  const disabled = pending || socialSpendLoading;

  return (
    <div className="protocol-compose-fund-season-fields">
      {fundableSeasonIds.length ? (
        <div className="guild-field">
          <ChoiceDrawerField
            label="Season"
            value={seasonId}
            options={fundableSeasonIds.map(
              (id): ChoiceOption<string> => ({
                value: id,
                label: id,
              })
            )}
            onChange={onSeasonIdChange}
            disabled={disabled}
            persistSelected
            copy="Live rally seasons reported on-chain"
            zIndex={zIndex}
          />
        </div>
      ) : (
        <label className="guild-field">
          <span>Season id</span>
          <input
            type="text"
            value={seasonId}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="season2"
            onChange={(event) => onSeasonIdChange(event.target.value)}
            disabled={disabled}
            className={osFieldBorderedClassName}
          />
        </label>
      )}
      <ProtocolComposeAmountField
        label="Amount"
        value={amountSocial}
        onValueChange={onAmountChange}
        disabled={disabled}
        clampInputToMax
        maxYocto={balanceYocto}
        maxDisabled={socialSpendLoading}
        meta={`DAO balance ${formatProtocolComposeMaxAmount(balanceYocto)} SOCIAL`}
      />
      {socialSpendContext && fundableSeasonIds.length === 0 ? (
        <p className="protocol-compose-note is-warn">
          No live rally seasons were reported on-chain; enter an id manually if
          needed.
        </p>
      ) : null}
    </div>
  );
}
