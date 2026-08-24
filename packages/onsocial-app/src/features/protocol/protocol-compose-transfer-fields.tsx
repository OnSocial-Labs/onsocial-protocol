'use client';

import { useMemo, type ReactNode } from 'react';
import {
  ChoiceDrawerField,
  TokenIcon,
  type ChoiceOption,
} from '@onsocial/ui';
import type { NearAccountStatus } from '@/hooks/use-near-account-status';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';
import { ProtocolComposeAmountField } from '@/features/protocol/protocol-compose-amount-field';
import { ProtocolComposeNearAccountField } from '@/features/protocol/protocol-compose-near-account-field';
import {
  formatProtocolTransferAssetAmount,
  protocolTransferAssetOptionValue,
  protocolTransferTokenIdFromOptionValue,
  resolveProtocolTransferAsset,
} from '@/features/protocol/protocol-transfer-compose';

export function protocolTransferAssetIcon(
  asset: Pick<ProtocolDaoTransferAsset, 'icon' | 'symbol'>,
  size: 'sm' | 'md' = 'sm'
): ReactNode {
  return <TokenIcon src={asset.icon} label={asset.symbol} size={size} />;
}

export function ProtocolComposeTransferFields({
  formId,
  transferAssets,
  transferAssetsLoading,
  transferTokenId,
  onTransferTokenChange,
  receiverId,
  receiverStatus,
  onReceiverChange,
  amountInput,
  onAmountChange,
  pending = false,
  zIndex,
}: {
  formId: string;
  transferAssets: readonly ProtocolDaoTransferAsset[];
  transferAssetsLoading: boolean;
  transferTokenId: string;
  onTransferTokenChange: (tokenId: string) => void;
  receiverId: string;
  receiverStatus: NearAccountStatus;
  onReceiverChange: (value: string) => void;
  amountInput: string;
  onAmountChange: (value: string) => void;
  pending?: boolean;
  zIndex?: number;
}) {
  const selectedAsset = useMemo(
    () => resolveProtocolTransferAsset(transferAssets, transferTokenId),
    [transferAssets, transferTokenId]
  );
  const assetOptions = useMemo(
    () =>
      transferAssets.map(
        (asset): ChoiceOption<string> => ({
          value: protocolTransferAssetOptionValue(asset.tokenId),
          label: asset.symbol,
          description: `${formatProtocolTransferAssetAmount(
            asset.balanceSmallest,
            asset.decimals
          )} available`,
          leading: protocolTransferAssetIcon(asset),
        })
      ),
    [transferAssets]
  );
  const disabled = pending || transferAssetsLoading;

  if (transferAssets.length === 0) {
    return (
      <p
        className={`protocol-compose-note${
          transferAssetsLoading ? '' : ' is-warn'
        }`}
      >
        {transferAssetsLoading
          ? 'Loading treasury assets…'
          : 'No spendable assets in this treasury.'}
      </p>
    );
  }

  return (
    <div className="protocol-compose-transfer-fields">
      <div className="guild-field protocol-compose-transfer-asset">
        <ChoiceDrawerField
          label="Asset"
          value={protocolTransferAssetOptionValue(
            selectedAsset?.tokenId ?? transferTokenId
          )}
          options={assetOptions}
          chipLeading={
            selectedAsset ? protocolTransferAssetIcon(selectedAsset) : undefined
          }
          persistSelected
          onChange={(next) =>
            onTransferTokenChange(protocolTransferTokenIdFromOptionValue(next))
          }
          disabled={disabled}
          copy="Spendable balance held by this DAO"
          zIndex={zIndex}
        />
      </div>
      <ProtocolComposeNearAccountField
        id={`${formId}-transfer-recipient`}
        label="Recipient"
        value={receiverId}
        status={receiverStatus}
        onValueChange={onReceiverChange}
        disabled={disabled}
        requireOnChain={false}
      />
      {selectedAsset ? (
        <ProtocolComposeAmountField
          id={`${formId}-transfer-amount`}
          label="Amount"
          value={amountInput}
          onValueChange={onAmountChange}
          disabled={disabled}
          unit={selectedAsset.symbol}
          showSocialIcon={false}
          tokenIconSrc={selectedAsset.icon}
          maxDecimals={selectedAsset.decimals}
          maxYocto={selectedAsset.balanceSmallest}
          maxDisabled={transferAssetsLoading}
          meta={`DAO balance ${formatProtocolTransferAssetAmount(
            selectedAsset.balanceSmallest,
            selectedAsset.decimals
          )} ${selectedAsset.symbol}`}
          formatMaxAmount={() =>
            formatProtocolTransferAssetAmount(
              selectedAsset.balanceSmallest,
              selectedAsset.decimals
            )
          }
        />
      ) : null}
    </div>
  );
}
