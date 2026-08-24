'use client';

import { useMemo } from 'react';
import {
  PROTOCOL_POLICY_ACTION_COMMON,
  PROTOCOL_POLICY_ACTION_GROUPS,
  PROTOCOL_POLICY_ACTION_OPTIONS,
  readLastProtocolPolicyAction,
  rememberProtocolPolicyAction,
  type ProtocolPolicyActionId,
} from '@/features/protocol/protocol-policy';
import {
  ProtocolPickerItem,
  ProtocolPickerSection,
  ProtocolPickerSheet,
  ProtocolPickerStatus,
  protocolPickerItemLockReason,
  useProtocolPickerEligibility,
} from '@/features/protocol/protocol-picker-sheet';
import { viewerHasPolicyActionPermission } from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

/**
 * Settings action picker — permission-dead actions hidden; stake-short stays
 * visible (bond / stake gate on the confirm hug after the form).
 */
export function ProtocolSettingsActionSheet({
  open,
  onClose,
  daoAccountId,
  accountId,
  daoPolicy,
  lastAction = null,
  onSelectAction,
  onOpenStake,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
  /** Highlighted action from the previous settings flow (does not skip the drawer). */
  lastAction?: ProtocolPolicyActionId | null;
  onSelectAction: (actionId: ProtocolPolicyActionId) => void;
  onOpenStake: () => void;
}) {
  const eligibility = useProtocolPickerEligibility({
    open,
    daoAccountId,
    accountId,
    daoPolicy,
  });

  const highlightedAction = useMemo(() => {
    if (!open) return lastAction;
    return lastAction ?? readLastProtocolPolicyAction();
  }, [open, lastAction]);

  const filterByPermission = (
    options: typeof PROTOCOL_POLICY_ACTION_OPTIONS
  ) => {
    if (!accountId || eligibility.loadState !== 'ready') return options;
    return options.filter((option) =>
      viewerHasPolicyActionPermission(daoPolicy, accountId, option.id)
    );
  };

  const commonOptions = useMemo(
    () =>
      filterByPermission(
        PROTOCOL_POLICY_ACTION_COMMON.map((id) =>
          PROTOCOL_POLICY_ACTION_OPTIONS.find((option) => option.id === id)
        ).filter(
          (option): option is (typeof PROTOCOL_POLICY_ACTION_OPTIONS)[number] =>
            Boolean(option)
        )
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, daoPolicy, eligibility.loadState]
  );

  const commonIds = useMemo(
    () => new Set<ProtocolPolicyActionId>(PROTOCOL_POLICY_ACTION_COMMON),
    []
  );

  const grouped = useMemo(
    () =>
      PROTOCOL_POLICY_ACTION_GROUPS.map((group) => ({
        ...group,
        options: filterByPermission(
          PROTOCOL_POLICY_ACTION_OPTIONS.filter(
            (option) =>
              option.group === group.id && !commonIds.has(option.id)
          )
        ),
      })).filter((group) => group.options.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, daoPolicy, eligibility.loadState, commonIds]
  );

  const hasVisibleActions =
    commonOptions.length > 0 ||
    grouped.some((group) => group.options.length > 0);

  const selectAction = (actionId: ProtocolPolicyActionId) => {
    rememberProtocolPolicyAction(actionId);
    onSelectAction(actionId);
  };

  return (
    <ProtocolPickerSheet
      open={open}
      onClose={onClose}
      label="Settings"
      copy="Choose a DAO policy change."
      closeAriaLabel="Close settings"
      backdropLabel="Close settings"
    >
      <ProtocolPickerStatus
        accountId={accountId}
        loadState={eligibility.loadState}
        connectEmpty="Connect a wallet to propose settings."
        loadingEmpty="Checking what you can change…"
        errorNote="Could not verify settings eligibility. Close and try again."
        stakeBlocked={eligibility.stakeBlocked}
        stakeMessage={`Need ${eligibility.remainingLabel ?? 'more'} SOCIAL delegated to propose settings — stake now, or pick an action and confirm later.`}
        roleBlocked={eligibility.roleBlocked}
        onOpenStake={onOpenStake}
        onClose={onClose}
      />

      {accountId &&
      eligibility.loadState === 'ready' &&
      !hasVisibleActions ? (
        <p className="protocol-compose-note is-warn">
          No settings actions match your roles on this DAO.
        </p>
      ) : null}

      <ActionSection
        label="Common"
        options={commonOptions}
        accountId={accountId}
        loadState={eligibility.loadState}
        highlightedAction={highlightedAction}
        onSelectAction={selectAction}
      />

      {grouped.map((group) => (
        <ActionSection
          key={group.id}
          label={group.label}
          options={group.options}
          accountId={accountId}
          loadState={eligibility.loadState}
          highlightedAction={highlightedAction}
          onSelectAction={selectAction}
        />
      ))}
    </ProtocolPickerSheet>
  );
}

function ActionSection({
  label,
  options,
  accountId,
  loadState,
  highlightedAction,
  onSelectAction,
}: {
  label: string;
  options: typeof PROTOCOL_POLICY_ACTION_OPTIONS;
  accountId: string | null;
  loadState: ReturnType<typeof useProtocolPickerEligibility>['loadState'];
  highlightedAction: ProtocolPolicyActionId | null;
  onSelectAction: (actionId: ProtocolPolicyActionId) => void;
}) {
  if (options.length === 0) return null;

  return (
    <ProtocolPickerSection label={label}>
      {options.map((option) => {
        const lockReason = protocolPickerItemLockReason({
          accountId,
          loadState,
          readyReason: accountId ? null : 'Connect a wallet',
        });

        return (
          <ProtocolPickerItem
            key={option.id}
            label={option.label}
            hint={option.hint}
            lockReason={lockReason}
            isLast={highlightedAction === option.id}
            onSelect={() => onSelectAction(option.id)}
          />
        );
      })}
    </ProtocolPickerSection>
  );
}
