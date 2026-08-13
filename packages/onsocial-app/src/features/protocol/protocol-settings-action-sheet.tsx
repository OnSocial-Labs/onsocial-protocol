'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import { getProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import {
  PROTOCOL_POLICY_ACTION_COMMON,
  PROTOCOL_POLICY_ACTION_GROUPS,
  PROTOCOL_POLICY_ACTION_OPTIONS,
  readLastProtocolPolicyAction,
  rememberProtocolPolicyAction,
  type ProtocolPolicyActionId,
} from '@/features/protocol/protocol-policy';
import {
  canProposeProtocolPolicyAction,
  getProtocolPolicyActionLockReason,
  isProtocolDaoGroupMember,
} from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { formatSocialCompact } from '@/lib/format-social-balance';

/**
 * Settings action picker — choose a policy action, then the form opens.
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
  const titleId = useId();
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [delegatedWeight, setDelegatedWeight] = useState('0');
  const [canProposeAny, setCanProposeAny] = useState(true);
  const [remainingLabel, setRemainingLabel] = useState<string | null>(null);
  const [highlightedAction, setHighlightedAction] =
    useState<ProtocolPolicyActionId | null>(lastAction);

  const isGroupMember = useMemo(
    () => isProtocolDaoGroupMember(daoPolicy, accountId),
    [daoPolicy, accountId]
  );

  useEffect(() => {
    if (!open) {
      setLoadState('idle');
      setDelegatedWeight('0');
      setCanProposeAny(true);
      setRemainingLabel(null);
      return;
    }
    setHighlightedAction(lastAction ?? readLastProtocolPolicyAction());
    if (!daoAccountId || !accountId) {
      setLoadState('ready');
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoadState('loading');
      try {
        const eligibility = await getProtocolGovernanceEligibility(
          accountId,
          daoAccountId
        );
        if (cancelled) return;
        setDelegatedWeight(eligibility.delegatedWeight);
        setCanProposeAny(eligibility.canPropose || isGroupMember);
        setRemainingLabel(
          BigInt(eligibility.remainingToThreshold) > 0n
            ? formatSocialCompact(eligibility.remainingToThreshold)
            : null
        );
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setLoadState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId, accountId, isGroupMember, lastAction]);

  const commonOptions = useMemo(
    () =>
      PROTOCOL_POLICY_ACTION_COMMON.map((id) =>
        PROTOCOL_POLICY_ACTION_OPTIONS.find((option) => option.id === id)
      ).filter(
        (option): option is (typeof PROTOCOL_POLICY_ACTION_OPTIONS)[number] =>
          Boolean(option)
      ),
    []
  );

  const commonIds = useMemo(
    () => new Set<ProtocolPolicyActionId>(PROTOCOL_POLICY_ACTION_COMMON),
    []
  );

  const grouped = useMemo(
    () =>
      PROTOCOL_POLICY_ACTION_GROUPS.map((group) => ({
        ...group,
        options: PROTOCOL_POLICY_ACTION_OPTIONS.filter(
          (option) =>
            option.group === group.id && !commonIds.has(option.id)
        ),
      })).filter((group) => group.options.length > 0),
    [commonIds]
  );

  const stakeBlocked =
    Boolean(accountId) &&
    loadState === 'ready' &&
    !canProposeAny &&
    !isGroupMember;

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="os"
      sizing="hug"
      initialDetent="peek"
      peekRatio={0.62}
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close settings"
      bodyClassName="protocol-action-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Settings"
            subtitle="Choose a DAO policy change."
            onClose={onClose}
            closeAriaLabel="Close settings"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="protocol-propose-kind">
        {!accountId ? (
          <p className="protocol-empty">Connect a wallet to propose settings.</p>
        ) : null}

        {accountId && loadState === 'loading' ? (
          <p className="protocol-empty">Checking what you can change…</p>
        ) : null}

        {accountId && loadState === 'error' ? (
          <p className="protocol-compose-note is-warn">
            Could not verify settings eligibility. Close and try again.
          </p>
        ) : null}

        {stakeBlocked ? (
          <div className="protocol-propose-kind-block">
            <p className="protocol-compose-note is-warn">
              Need {remainingLabel ?? 'more'} SOCIAL delegated to propose
              settings.
            </p>
            <button
              type="button"
              className="protocol-tool"
              onClick={() => {
                onClose();
                onOpenStake();
              }}
            >
              Stake
            </button>
          </div>
        ) : null}

        <ActionSection
          label="Common"
          options={commonOptions}
          accountId={accountId}
          loadState={loadState}
          daoPolicy={daoPolicy}
          delegatedWeight={delegatedWeight}
          canProposeAny={canProposeAny}
          isGroupMember={isGroupMember}
          remainingLabel={remainingLabel}
          highlightedAction={highlightedAction}
          onSelectAction={(actionId) => {
            rememberProtocolPolicyAction(actionId);
            onSelectAction(actionId);
          }}
        />

        {grouped.map((group) => (
          <ActionSection
            key={group.id}
            label={group.label}
            options={group.options}
            accountId={accountId}
            loadState={loadState}
            daoPolicy={daoPolicy}
            delegatedWeight={delegatedWeight}
            canProposeAny={canProposeAny}
            isGroupMember={isGroupMember}
            remainingLabel={remainingLabel}
            highlightedAction={highlightedAction}
            onSelectAction={(actionId) => {
              rememberProtocolPolicyAction(actionId);
              onSelectAction(actionId);
            }}
          />
        ))}
      </div>
    </GlassSheet>
  );
}

function ActionSection({
  label,
  options,
  accountId,
  loadState,
  daoPolicy,
  delegatedWeight,
  canProposeAny,
  isGroupMember,
  remainingLabel,
  highlightedAction,
  onSelectAction,
}: {
  label: string;
  options: typeof PROTOCOL_POLICY_ACTION_OPTIONS;
  accountId: string | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  daoPolicy: ProtocolDaoPolicy | null;
  delegatedWeight: string;
  canProposeAny: boolean;
  isGroupMember: boolean;
  remainingLabel: string | null;
  highlightedAction: ProtocolPolicyActionId | null;
  onSelectAction: (actionId: ProtocolPolicyActionId) => void;
}) {
  if (options.length === 0) return null;

  return (
    <section className="protocol-propose-kind-group">
      <h3 className="protocol-propose-kind-group-label">{label}</h3>
      <ul className="protocol-propose-kind-list">
        {options.map((option) => {
          const canProposeAction =
            Boolean(accountId) &&
            loadState === 'ready' &&
            canProposeProtocolPolicyAction(
              daoPolicy,
              accountId,
              delegatedWeight,
              option.id
            );
          const lockReason =
            loadState === 'ready'
              ? getProtocolPolicyActionLockReason({
                  actionId: option.id,
                  accountId,
                  canProposeAny,
                  isGroupMember,
                  remainingLabel,
                  canProposeAction,
                })
              : loadState === 'loading'
                ? 'Checking…'
                : loadState === 'error'
                  ? 'Unavailable'
                  : accountId
                    ? null
                    : 'Connect a wallet';
          const disabled = Boolean(lockReason);
          const isLast = highlightedAction === option.id;

          return (
            <li key={option.id}>
              <button
                type="button"
                className={[
                  'protocol-propose-kind-item',
                  isLast ? 'is-last' : '',
                  disabled ? 'is-locked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={disabled}
                aria-current={isLast ? 'true' : undefined}
                onClick={() => onSelectAction(option.id)}
              >
                <span className="protocol-propose-kind-item-top">
                  <span className="protocol-propose-kind-item-label">
                    {option.label}
                  </span>
                  {isLast ? (
                    <span className="protocol-propose-kind-item-badge">
                      Last used
                    </span>
                  ) : null}
                </span>
                <span className="protocol-propose-kind-item-hint">
                  {disabled && lockReason ? lockReason : option.hint}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
