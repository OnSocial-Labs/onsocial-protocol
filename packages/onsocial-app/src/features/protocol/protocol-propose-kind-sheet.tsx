'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PROTOCOL_CREATE_KIND_COMMON,
  PROTOCOL_CREATE_KIND_GROUPS,
  PROTOCOL_CREATE_KIND_OPTIONS,
  readLastProtocolCreateKind,
  rememberProtocolCreateKind,
  type ProtocolCreateKind,
} from '@/features/protocol/protocol-create';
import {
  ProtocolPickerItem,
  ProtocolPickerSection,
  ProtocolPickerSheet,
  ProtocolPickerStatus,
  protocolPickerItemLockReason,
  useProtocolPickerEligibility,
} from '@/features/protocol/protocol-picker-sheet';
import {
  canProposeProtocolCreateKind,
  getProtocolCreateKindLockReason,
} from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

/**
 * Propose kind picker — choose a proposal type, then the create form opens.
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
  const [highlightedKind, setHighlightedKind] =
    useState<ProtocolCreateKind | null>(lastKind);
  const eligibility = useProtocolPickerEligibility({
    open,
    daoAccountId,
    accountId,
    daoPolicy,
  });

  useEffect(() => {
    if (!open) return;
    setHighlightedKind(lastKind ?? readLastProtocolCreateKind());
  }, [open, lastKind]);

  const commonOptions = useMemo(
    () =>
      PROTOCOL_CREATE_KIND_COMMON.map((id) =>
        PROTOCOL_CREATE_KIND_OPTIONS.find((option) => option.id === id)
      ).filter(
        (option): option is (typeof PROTOCOL_CREATE_KIND_OPTIONS)[number] =>
          Boolean(option)
      ),
    []
  );

  const commonIds = useMemo(
    () => new Set<ProtocolCreateKind>(PROTOCOL_CREATE_KIND_COMMON),
    []
  );

  const grouped = useMemo(
    () =>
      PROTOCOL_CREATE_KIND_GROUPS.map((group) => ({
        ...group,
        options: PROTOCOL_CREATE_KIND_OPTIONS.filter(
          (option) =>
            option.group === group.id && !commonIds.has(option.id)
        ),
      })).filter((group) => group.options.length > 0),
    [commonIds]
  );

  const selectKind = (kind: ProtocolCreateKind) => {
    rememberProtocolCreateKind(kind);
    onSelectKind(kind);
  };

  return (
    <ProtocolPickerSheet
      open={open}
      onClose={onClose}
      label="Propose"
      copy="Choose what to put on-chain."
      closeAriaLabel="Close propose"
      backdropLabel="Close propose"
    >
      <ProtocolPickerStatus
        accountId={accountId}
        loadState={eligibility.loadState}
        connectEmpty="Connect a wallet to propose."
        loadingEmpty="Checking what you can propose…"
        errorNote="Could not verify proposal eligibility. Close and try again."
        stakeBlocked={eligibility.stakeBlocked}
        stakeMessage={`Need ${eligibility.remainingLabel ?? 'more'} SOCIAL delegated to propose.`}
        onOpenStake={onOpenStake}
        onClose={onClose}
      />

      <KindSection
        label="Common"
        options={commonOptions}
        accountId={accountId}
        eligibility={eligibility}
        daoPolicy={daoPolicy}
        highlightedKind={highlightedKind}
        onSelectKind={selectKind}
      />

      {grouped.map((group) => (
        <KindSection
          key={group.id}
          label={group.label}
          options={group.options}
          accountId={accountId}
          eligibility={eligibility}
          daoPolicy={daoPolicy}
          highlightedKind={highlightedKind}
          onSelectKind={selectKind}
        />
      ))}
    </ProtocolPickerSheet>
  );
}

function KindSection({
  label,
  options,
  accountId,
  eligibility,
  daoPolicy,
  highlightedKind,
  onSelectKind,
}: {
  label: string;
  options: typeof PROTOCOL_CREATE_KIND_OPTIONS;
  accountId: string | null;
  eligibility: ReturnType<typeof useProtocolPickerEligibility>;
  daoPolicy: ProtocolDaoPolicy | null;
  highlightedKind: ProtocolCreateKind | null;
  onSelectKind: (kind: ProtocolCreateKind) => void;
}) {
  if (options.length === 0) return null;

  return (
    <ProtocolPickerSection label={label}>
      {options.map((option) => {
        const canProposeKind =
          Boolean(accountId) &&
          eligibility.loadState === 'ready' &&
          canProposeProtocolCreateKind(
            daoPolicy,
            accountId,
            eligibility.delegatedWeight,
            option.id
          );
        const lockReason = protocolPickerItemLockReason({
          accountId,
          loadState: eligibility.loadState,
          readyReason: getProtocolCreateKindLockReason({
            kind: option.id,
            accountId,
            canProposeAny: eligibility.canProposeAny,
            isGroupMember: eligibility.isGroupMember,
            remainingLabel: eligibility.remainingLabel,
            canProposeKind,
          }),
        });

        return (
          <ProtocolPickerItem
            key={option.id}
            label={option.label}
            hint={option.hint}
            lockReason={lockReason}
            isLast={highlightedKind === option.id}
            onSelect={() => onSelectKind(option.id)}
          />
        );
      })}
    </ProtocolPickerSection>
  );
}
