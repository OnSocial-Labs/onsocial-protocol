'use client';

import { useMemo } from 'react';
import {
  PROTOCOL_CREATE_KIND_COMMON,
  PROTOCOL_CREATE_KIND_GROUPS,
  PROTOCOL_CREATE_KIND_OPTIONS,
  readLastProtocolCreateKind,
  rememberProtocolCreateKind,
  type ProtocolCreateKind,
} from '@/features/protocol/protocol-create';
import {
  buildProtocolPickerSections,
  countProtocolPickerOptions,
  protocolPickerForeignStakeMessage,
  protocolPickerStakeGateMessage,
  resolveProtocolPickerSheetLayout,
} from '@/features/protocol/protocol-picker-sections';
import {
  ProtocolPickerOptionList,
  ProtocolPickerSheet,
  ProtocolPickerStatus,
  useProtocolPickerEligibility,
} from '@/features/protocol/protocol-picker-sheet';
import { isProtocolCreateKindChainAvailable } from '@/features/protocol/protocol-propose-chain-filter';
import { viewerHasCreateKindPermission } from '@/features/protocol/protocol-propose-gate';
import { useProtocolProposeChainContext } from '@/features/protocol/use-protocol-propose-chain-context';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

/**
 * Propose kind picker — policy + on-chain capability; stake-short kinds stay
 * visible until confirm (bond / stake gate lands on the confirm hug).
 */
export function ProtocolProposeKindSheet({
  open,
  onClose,
  daoAccountId,
  accountId,
  daoPolicy,
  lastKind = null,
  onSelectKind,
  onOpenStake,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
  /** Highlighted kind from the previous propose (does not skip the drawer). */
  lastKind?: ProtocolCreateKind | null;
  onSelectKind: (kind: ProtocolCreateKind) => void;
  onOpenStake: () => void;
}) {
  const eligibility = useProtocolPickerEligibility({
    open,
    daoAccountId,
    accountId,
    daoPolicy,
  });
  const chainContext = useProtocolProposeChainContext(daoAccountId, open);

  const highlightedKind = useMemo(() => {
    if (!open) return lastKind;
    return lastKind ?? readLastProtocolCreateKind();
  }, [open, lastKind]);

  const pickerLoading =
    Boolean(accountId) &&
    (eligibility.loadState === 'loading' || chainContext.loadState === 'loading');
  const pickerReady =
    Boolean(accountId) &&
    eligibility.loadState === 'ready' &&
    chainContext.loadState === 'ready';
  const pickerError =
    Boolean(accountId) &&
    (eligibility.loadState === 'error' || chainContext.loadState === 'error');

  const { common, grouped, hasVisible } = useMemo(
    () =>
      buildProtocolPickerSections({
        allOptions: PROTOCOL_CREATE_KIND_OPTIONS,
        commonIds: PROTOCOL_CREATE_KIND_COMMON,
        groups: PROTOCOL_CREATE_KIND_GROUPS,
        filterReady: pickerReady,
        hasPermission: (id) => {
          if (!viewerHasCreateKindPermission(daoPolicy, accountId, id)) {
            return false;
          }
          if (!pickerReady) return false;
          return isProtocolCreateKindChainAvailable(id, chainContext.chain);
        },
      }),
    [accountId, chainContext.chain, daoPolicy, pickerReady]
  );

  const sections = useMemo(
    () => [
      { key: 'common', label: 'Common', options: common },
      ...grouped.map((group) => ({
        key: group.id,
        label: group.label,
        options: group.options,
      })),
    ],
    [common, grouped]
  );

  const optionCount = useMemo(
    () => countProtocolPickerOptions(common, grouped),
    [common, grouped]
  );

  const sheetLayout = useMemo(
    () => resolveProtocolPickerSheetLayout(optionCount),
    [optionCount]
  );

  const selectKind = (kind: ProtocolCreateKind) => {
    rememberProtocolCreateKind(kind);
    onSelectKind(kind);
  };

  const statusLoadState = !accountId
    ? eligibility.loadState
    : pickerLoading
      ? 'loading'
      : pickerError
        ? 'error'
        : 'ready';

  return (
    <ProtocolPickerSheet
      open={open}
      onClose={onClose}
      label="Propose"
      copy="Choose what to put on-chain."
      closeAriaLabel="Close propose"
      backdropLabel="Close propose"
      initialDetent={sheetLayout.initialDetent}
      peekRatio={sheetLayout.peekRatio}
    >
      <ProtocolPickerStatus
        accountId={accountId}
        loadState={statusLoadState}
        connectEmpty="Connect a wallet to propose."
        loadingEmpty="Checking what you can propose…"
        errorNote="Could not verify proposal eligibility. Close and try again."
        stakeBlocked={eligibility.stakeBlocked}
        stakeMessage={protocolPickerStakeGateMessage(
          eligibility.remainingLabel,
          'propose'
        )}
        foreignStakeBlocked={eligibility.foreignStakeBlocked}
        foreignStakeMessage={protocolPickerForeignStakeMessage(
          eligibility.foreignStakeTokenLabel,
          'propose'
        )}
        roleBlocked={eligibility.roleBlocked}
        onOpenStake={onOpenStake}
        onClose={onClose}
      />

      {pickerReady && !hasVisible ? (
        <p className="protocol-compose-note is-warn">
          No proposal types match your roles on this DAO.
        </p>
      ) : null}

      <ProtocolPickerOptionList
        sections={sections}
        accountId={accountId}
        loadState={statusLoadState}
        highlightedId={highlightedKind}
        onSelect={selectKind}
      />
    </ProtocolPickerSheet>
  );
}
