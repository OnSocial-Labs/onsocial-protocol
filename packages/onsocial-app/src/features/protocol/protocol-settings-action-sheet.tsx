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

  const filterReady =
    Boolean(accountId) && eligibility.loadState === 'ready';

  const { common, grouped, hasVisible } = useMemo(
    () =>
      buildProtocolPickerSections({
        allOptions: PROTOCOL_POLICY_ACTION_OPTIONS,
        commonIds: PROTOCOL_POLICY_ACTION_COMMON,
        groups: PROTOCOL_POLICY_ACTION_GROUPS,
        filterReady,
        hasPermission: (id) =>
          viewerHasPolicyActionPermission(daoPolicy, accountId, id),
      }),
    [accountId, daoPolicy, filterReady]
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
      initialDetent={sheetLayout.initialDetent}
      peekRatio={sheetLayout.peekRatio}
    >
      <ProtocolPickerStatus
        accountId={accountId}
        loadState={eligibility.loadState}
        connectEmpty="Connect a wallet to propose settings."
        loadingEmpty="Checking what you can change…"
        errorNote="Could not verify settings eligibility. Close and try again."
        stakeBlocked={eligibility.stakeBlocked}
        stakeMessage={protocolPickerStakeGateMessage(
          eligibility.remainingLabel,
          'settings'
        )}
        foreignStakeBlocked={eligibility.foreignStakeBlocked}
        foreignStakeMessage={protocolPickerForeignStakeMessage(
          eligibility.foreignStakeTokenLabel,
          'settings'
        )}
        roleBlocked={eligibility.roleBlocked}
        onOpenStake={onOpenStake}
        onClose={onClose}
      />

      {accountId && eligibility.loadState === 'ready' && !hasVisible ? (
        <p className="protocol-compose-note is-warn">
          No settings actions match your roles on this DAO.
        </p>
      ) : null}

      <ProtocolPickerOptionList
        sections={sections}
        accountId={accountId}
        loadState={eligibility.loadState}
        highlightedId={highlightedAction}
        onSelect={selectAction}
      />
    </ProtocolPickerSheet>
  );
}
