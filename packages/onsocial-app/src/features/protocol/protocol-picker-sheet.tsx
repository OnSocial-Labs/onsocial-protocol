'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { shouldShowProtocolPickerOptions } from '@/features/protocol/protocol-picker-sections';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import { getProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import { isProtocolDaoGroupMember } from '@/features/protocol/protocol-propose-gate';
import { PROTOCOL_TASK_SHEET_Z } from '@/features/protocol/protocol-sheet-z';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { formatSocialCompact } from '@/lib/format-social-balance';

export type ProtocolPickerLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type ProtocolPickerEligibility = {
  loadState: ProtocolPickerLoadState;
  delegatedWeight: string;
  canProposeAny: boolean;
  remainingLabel: string | null;
  isGroupMember: boolean;
  hasStakeProposePath: boolean;
  foreignStakeTokenLabel: string | null;
  stakeBlocked: boolean;
  foreignStakeBlocked: boolean;
  roleBlocked: boolean;
};

export function deriveProtocolPickerEligibility(
  eligibility: ProtocolGovernanceEligibility | null,
  accountId: string | null,
  daoPolicy: ProtocolDaoPolicy | null,
  loadState: ProtocolPickerLoadState
): ProtocolPickerEligibility {
  const isGroupMember = isProtocolDaoGroupMember(daoPolicy, accountId);
  const canProposeAny = Boolean(eligibility?.canAddProposal);
  const hasStakeProposePath = Boolean(eligibility?.hasStakeProposePath);
  const foreignStakeTokenLabel = eligibility?.foreignStakeTokenLabel ?? null;
  const remainingLabel =
    eligibility?.hasStakeProposePath &&
    BigInt(eligibility.remainingToThreshold) > 0n
      ? formatSocialCompact(eligibility.remainingToThreshold)
      : null;
  const stakeBlocked =
    Boolean(accountId) &&
    loadState === 'ready' &&
    !canProposeAny &&
    hasStakeProposePath;
  const foreignStakeBlocked =
    Boolean(accountId) &&
    loadState === 'ready' &&
    !canProposeAny &&
    Boolean(foreignStakeTokenLabel);
  const roleBlocked =
    Boolean(accountId) &&
    loadState === 'ready' &&
    !canProposeAny &&
    !hasStakeProposePath &&
    !foreignStakeTokenLabel;

  return {
    loadState,
    delegatedWeight: eligibility?.delegatedWeight ?? '0',
    canProposeAny,
    remainingLabel,
    isGroupMember,
    hasStakeProposePath,
    foreignStakeTokenLabel,
    stakeBlocked,
    foreignStakeBlocked,
    roleBlocked,
  };
}

/** Shared eligibility for Propose / Settings picker — face snapshot first. */
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
  const face = useMatchingDaoFaceEligibility(daoAccountId);
  const [fetched, setFetched] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [fetchState, setFetchState] =
    useState<ProtocolPickerLoadState>('idle');

  useEffect(() => {
    if (!open || face) {
      if (!open) {
        queueMicrotask(() => {
          setFetched(null);
          setFetchState('idle');
        });
      }
      return;
    }
    if (!daoAccountId || !accountId) {
      queueMicrotask(() => setFetchState('ready'));
      return;
    }

    let cancelled = false;
    queueMicrotask(() => setFetchState('loading'));
    void getProtocolGovernanceEligibility(accountId, daoAccountId)
      .then((next) => {
        if (cancelled) return;
        setFetched(next);
        setFetchState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, daoAccountId, face, open]);

  const loadState: ProtocolPickerLoadState = !open
    ? 'idle'
    : face
      ? face.isLoading && !face.eligibility
        ? 'loading'
        : 'ready'
      : fetchState;

  return deriveProtocolPickerEligibility(
    face ? face.eligibility : fetched,
    accountId,
    daoPolicy,
    loadState
  );
}

/**
 * Propose / Settings pickers — ActionDrawer (choice hug, short cap).
 * Wallet-like content height; not a 90dvh catalog.
 */
export function ProtocolPickerSheet({
  open,
  onClose,
  label,
  copy,
  closeAriaLabel,
  backdropLabel,
  items,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  copy: string;
  closeAriaLabel: string;
  backdropLabel: string;
  items?: readonly ActionDrawerItem[];
  children?: ReactNode;
}) {
  return (
    <ActionDrawer
      open={open}
      onClose={onClose}
      label={label}
      copy={copy}
      closeAriaLabel={closeAriaLabel}
      backdropLabel={backdropLabel}
      zIndex={PROTOCOL_TASK_SHEET_Z}
      panelClassName="os-sheet-cap-short"
      bodyClassName="protocol-action-sheet-body protocol-picker-sheet-body"
      listAriaLabel={label}
      items={items}
    >
      {children ? (
        <div className="protocol-propose-kind">{children}</div>
      ) : null}
    </ActionDrawer>
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
  foreignStakeBlocked = false,
  foreignStakeMessage = "Need this DAO's token stake.",
  roleBlocked = false,
  roleMessage = 'You are not on a proposing role on this DAO.',
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
  foreignStakeBlocked?: boolean;
  foreignStakeMessage?: string;
  roleBlocked?: boolean;
  roleMessage?: string;
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
        <div className="protocol-propose-kind-current">
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

      {foreignStakeBlocked ? (
        <p className="protocol-compose-note is-warn">{foreignStakeMessage}</p>
      ) : null}

      {roleBlocked ? (
        <p className="protocol-compose-note is-warn">{roleMessage}</p>
      ) : null}
    </>
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

/** ActionDrawer items for Propose / Settings — empty until a wallet can pick. */
export function buildProtocolPickerActionItems<T extends string>({
  sections,
  accountId,
  loadState,
  highlightedId,
  onSelect,
}: {
  sections: Array<{
    key: string;
    label: string;
    options: Array<{ id: T; label: string; hint: string }>;
  }>;
  accountId: string | null;
  loadState: ProtocolPickerLoadState;
  highlightedId: T | null;
  onSelect: (id: T) => void;
}): ActionDrawerItem[] {
  if (!shouldShowProtocolPickerOptions(accountId, loadState)) return [];

  return sections.flatMap((section) =>
    section.options.map((option) => {
      const lockReason = protocolPickerItemLockReason({
        accountId,
        loadState,
        readyReason: accountId ? null : 'Connect a wallet',
      });
      return {
        id: option.id,
        label: option.label,
        description: lockReason ?? option.hint,
        section: section.label,
        disabled: Boolean(lockReason),
        trailing: highlightedId === option.id ? 'Last used' : undefined,
        onSelect: () => onSelect(option.id),
      };
    })
  );
}
