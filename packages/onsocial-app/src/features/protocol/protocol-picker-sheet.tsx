'use client';

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { OsHugSheet } from '@onsocial/ui';
import { getProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import { isProtocolDaoGroupMember } from '@/features/protocol/protocol-propose-gate';
import { PROTOCOL_TASK_SHEET_Z } from '@/features/protocol/protocol-sheet-z';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { formatSocialCompact } from '@/lib/format-social-balance';

export type ProtocolPickerLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type ProtocolPickerEligibility = {
  loadState: ProtocolPickerLoadState;
  delegatedWeight: string;
  canProposeAny: boolean;
  remainingLabel: string | null;
  isGroupMember: boolean;
  stakeBlocked: boolean;
};

/** Shared eligibility load for Propose / Settings picker hug sheets. */
export function useProtocolPickerEligibility({
  open,
  daoAccountId,
  accountId,
  daoPolicy,
}: {
  open: boolean;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
}): ProtocolPickerEligibility {
  const [loadState, setLoadState] = useState<ProtocolPickerLoadState>('idle');
  const [delegatedWeight, setDelegatedWeight] = useState('0');
  const [canProposeAny, setCanProposeAny] = useState(true);
  const [remainingLabel, setRemainingLabel] = useState<string | null>(null);

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
        setCanProposeAny(
          eligibility.canPropose || eligibility.isGroupMember || isGroupMember
        );
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
  }, [open, daoAccountId, accountId, isGroupMember]);

  const stakeBlocked =
    Boolean(accountId) &&
    loadState === 'ready' &&
    !canProposeAny &&
    !isGroupMember;

  return {
    loadState,
    delegatedWeight,
    canProposeAny,
    remainingLabel,
    isGroupMember,
    stakeBlocked,
  };
}

/**
 * Hug shell for Protocol Propose / Settings action pickers.
 */
export function ProtocolPickerSheet({
  open,
  onClose,
  label,
  copy,
  closeAriaLabel,
  backdropLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  copy: string;
  closeAriaLabel: string;
  backdropLabel: string;
  children: ReactNode;
}) {
  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label={label}
      copy={copy}
      closeAriaLabel={closeAriaLabel}
      backdropLabel={backdropLabel}
      zIndex={PROTOCOL_TASK_SHEET_Z}
      initialDetent="peek"
      peekRatio={0.62}
      bodyClassName="protocol-action-sheet-body"
    >
      <div className="protocol-propose-kind">{children}</div>
    </OsHugSheet>
  );
}

export function ProtocolPickerStatus({
  accountId,
  loadState,
  connectEmpty,
  loadingEmpty,
  errorNote,
  stakeBlocked,
  stakeMessage,
  onOpenStake,
  onClose,
}: {
  accountId: string | null;
  loadState: ProtocolPickerLoadState;
  connectEmpty: string;
  loadingEmpty: string;
  errorNote: string;
  stakeBlocked: boolean;
  stakeMessage: string;
  onOpenStake: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {!accountId ? <p className="protocol-empty">{connectEmpty}</p> : null}

      {accountId && loadState === 'loading' ? (
        <p className="protocol-empty">{loadingEmpty}</p>
      ) : null}

      {accountId && loadState === 'error' ? (
        <p className="protocol-compose-note is-warn">{errorNote}</p>
      ) : null}

      {stakeBlocked ? (
        <div className="protocol-propose-kind-block">
          <p className="protocol-compose-note is-warn">{stakeMessage}</p>
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
    </>
  );
}

export function ProtocolPickerSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="protocol-propose-kind-group">
      <h3 className="protocol-propose-kind-group-label">{label}</h3>
      <ul className="protocol-propose-kind-list">{children}</ul>
    </section>
  );
}

export function ProtocolPickerItem({
  label,
  hint,
  lockReason,
  isLast,
  onSelect,
}: {
  label: string;
  hint: string;
  lockReason: string | null;
  isLast: boolean;
  onSelect: () => void;
}) {
  const disabled = Boolean(lockReason);

  return (
    <li>
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
        onClick={onSelect}
      >
        <span className="protocol-propose-kind-item-top">
          <span className="protocol-propose-kind-item-label">{label}</span>
          {isLast ? (
            <span className="protocol-propose-kind-item-badge">Last used</span>
          ) : null}
        </span>
        <span className="protocol-propose-kind-item-hint">
          {disabled && lockReason ? lockReason : hint}
        </span>
      </button>
    </li>
  );
}

export function protocolPickerItemLockReason({
  accountId,
  loadState,
  readyReason,
}: {
  accountId: string | null;
  loadState: ProtocolPickerLoadState;
  readyReason: string | null;
}): string | null {
  if (loadState === 'ready') return readyReason;
  if (loadState === 'loading') return 'Checking…';
  if (loadState === 'error') return 'Unavailable';
  if (!accountId) return 'Connect a wallet';
  return null;
}
