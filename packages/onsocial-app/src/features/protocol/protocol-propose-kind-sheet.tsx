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
  ProtocolPickerItem,
  ProtocolPickerSection,
  ProtocolPickerSheet,
  ProtocolPickerStatus,
  protocolPickerItemLockReason,
  useProtocolPickerEligibility,
} from '@/features/protocol/protocol-picker-sheet';
import { viewerHasCreateKindPermission } from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

/**
 * Propose kind picker — permission-dead kinds hidden; stake-short stays visible
 * (bond / stake gate lands on the confirm hug after compose).
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

  const highlightedKind = useMemo(() => {
    if (!open) return lastKind;
    return lastKind ?? readLastProtocolCreateKind();
  }, [open, lastKind]);

  const filterByPermission = (
    options: typeof PROTOCOL_CREATE_KIND_OPTIONS
  ) => {
    if (!accountId || eligibility.loadState !== 'ready') return options;
    return options.filter((option) =>
      viewerHasCreateKindPermission(daoPolicy, accountId, option.id)
    );
  };

  const commonOptions = useMemo(
    () =>
      filterByPermission(
        PROTOCOL_CREATE_KIND_COMMON.map((id) =>
          PROTOCOL_CREATE_KIND_OPTIONS.find((option) => option.id === id)
        ).filter(
          (option): option is (typeof PROTOCOL_CREATE_KIND_OPTIONS)[number] =>
            Boolean(option)
        )
      ),
    // eligibility.loadState + daoPolicy + accountId drive filter
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter reads those
    [accountId, daoPolicy, eligibility.loadState]
  );

  const commonIds = useMemo(
    () => new Set<ProtocolCreateKind>(PROTOCOL_CREATE_KIND_COMMON),
    []
  );

  const grouped = useMemo(
    () =>
      PROTOCOL_CREATE_KIND_GROUPS.map((group) => ({
        ...group,
        options: filterByPermission(
          PROTOCOL_CREATE_KIND_OPTIONS.filter(
            (option) =>
              option.group === group.id && !commonIds.has(option.id)
          )
        ),
      })).filter((group) => group.options.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, daoPolicy, eligibility.loadState, commonIds]
  );

  const hasVisibleKinds =
    commonOptions.length > 0 || grouped.some((group) => group.options.length > 0);

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
        stakeMessage={`Need ${eligibility.remainingLabel ?? 'more'} SOCIAL delegated to propose — stake now, or pick a kind and confirm later.`}
        foreignStakeBlocked={eligibility.foreignStakeBlocked}
        foreignStakeMessage={`Need ${eligibility.foreignStakeTokenLabel ?? "this DAO's token"} stake to propose.`}
        roleBlocked={eligibility.roleBlocked}
        onOpenStake={onOpenStake}
        onClose={onClose}
      />

      {accountId &&
      eligibility.loadState === 'ready' &&
      !hasVisibleKinds ? (
        <p className="protocol-compose-note is-warn">
          No proposal types match your roles on this DAO.
        </p>
      ) : null}

      <KindSection
        label="Common"
        options={commonOptions}
        accountId={accountId}
        loadState={eligibility.loadState}
        highlightedKind={highlightedKind}
        onSelectKind={selectKind}
      />

      {grouped.map((group) => (
        <KindSection
          key={group.id}
          label={group.label}
          options={group.options}
          accountId={accountId}
          loadState={eligibility.loadState}
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
  loadState,
  highlightedKind,
  onSelectKind,
}: {
  label: string;
  options: typeof PROTOCOL_CREATE_KIND_OPTIONS;
  accountId: string | null;
  loadState: ReturnType<typeof useProtocolPickerEligibility>['loadState'];
  highlightedKind: ProtocolCreateKind | null;
  onSelectKind: (kind: ProtocolCreateKind) => void;
}) {
  if (options.length === 0) return null;

  return (
    <ProtocolPickerSection label={label}>
      {options.map((option) => {
        // Permission already filtered. Only soft-lock while checking / disconnected —
        // stake shortfalls stay selectable; confirm hug gates bond + stake.
        const lockReason = protocolPickerItemLockReason({
          accountId,
          loadState,
          // Permission already filtered. Soft-lock only when disconnected /
          // loading — stake shortfalls stay selectable for the confirm hug.
          readyReason: accountId ? null : 'Connect a wallet',
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
