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
  protocolPickerForeignStakeMessage,
  protocolPickerStakeGateMessage,
} from '@/features/protocol/protocol-picker-sections';
import {
  ProtocolPickerSheet,
  ProtocolPickerStatus,
  buildProtocolPickerActionItems,
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
  factsReady = true,
  lastAction = null,
  onSelectAction,
  onOpenStake,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
  /** False while DAO config or policy is still loading. */
  factsReady?: boolean;
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

  const policyMissing = Boolean(accountId) && factsReady && daoPolicy == null;
  const statusLoadState = !accountId
    ? eligibility.loadState
    : policyMissing || !factsReady || eligibility.loadState === 'loading'
      ? 'loading'
      : eligibility.loadState;
  const filterReady =
    Boolean(accountId) &&
    factsReady &&
    daoPolicy != null &&
    eligibility.loadState === 'ready';

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

  const items = useMemo(
    () =>
      buildProtocolPickerActionItems({
        sections,
        accountId,
        loadState: policyMissing ? 'loading' : statusLoadState,
        highlightedId: highlightedAction,
        onSelect: (actionId) => {
          rememberProtocolPolicyAction(actionId);
          onSelectAction(actionId);
        },
      }),
    [
      accountId,
      highlightedAction,
      onSelectAction,
      policyMissing,
      sections,
      statusLoadState,
    ]
  );

  return (
    <ProtocolPickerSheet
      open={open}
      onClose={onClose}
      label="Settings"
      copy="Choose a DAO policy change."
      closeAriaLabel="Close settings"
      backdropLabel="Close settings"
      items={items}
    >
      {policyMissing ? (
        <p className="protocol-empty">DAO policy is unavailable.</p>
      ) : (
        <>
          <ProtocolPickerStatus
            accountId={accountId}
            loadState={statusLoadState}
            connectEmpty="Connect a wallet to propose settings."
            loadingEmpty={
              factsReady
                ? 'Checking what you can change…'
                : 'Loading DAO policy…'
            }
            errorNote="Could not verify settings eligibility. Close and try again."
            stakeBlocked={filterReady && eligibility.stakeBlocked}
            stakeMessage={protocolPickerStakeGateMessage(
              eligibility.remainingLabel,
              'settings'
            )}
            foreignStakeBlocked={filterReady && eligibility.foreignStakeBlocked}
            foreignStakeMessage={protocolPickerForeignStakeMessage(
              eligibility.foreignStakeTokenLabel,
              'settings'
            )}
            roleBlocked={filterReady && eligibility.roleBlocked}
            onOpenStake={onOpenStake}
            onClose={onClose}
          />

          {filterReady && !hasVisible ? (
            <p className="protocol-compose-note is-warn">
              No settings actions match your roles on this DAO.
            </p>
          ) : null}
        </>
      )}
    </ProtocolPickerSheet>
  );
}
