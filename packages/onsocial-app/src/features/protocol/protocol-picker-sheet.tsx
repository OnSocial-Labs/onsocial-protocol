'use client';

import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  OsHugSheet,
  OsSurfaceRow,
  OsSurfaceRowList,
  type GlassSheetDetent,
} from '@onsocial/ui';
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
  initialDetent = 'peek',
  peekRatio = 0.62,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  copy: string;
  closeAriaLabel: string;
  backdropLabel: string;
  children: ReactNode;
  initialDetent?: GlassSheetDetent;
  peekRatio?: number;
}) {
  const longList = initialDetent === 'full';

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label={label}
      copy={copy}
      closeAriaLabel={closeAriaLabel}
      backdropLabel={backdropLabel}
      zIndex={PROTOCOL_TASK_SHEET_Z}
      sizing="hug"
      initialDetent={initialDetent}
      peekRatio={peekRatio}
      bodyClassName={
        longList
          ? 'protocol-action-sheet-body protocol-picker-sheet-body is-long'
          : 'protocol-action-sheet-body protocol-picker-sheet-body'
      }
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

export function ProtocolPickerOptionList<T extends string>({
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
}) {
  return sections.map((section) => {
    if (section.options.length === 0) return null;

    return (
      <ProtocolPickerSection key={section.key} label={section.label}>
        {section.options.map((option) => {
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
              isLast={highlightedId === option.id}
              onSelect={() => onSelect(option.id)}
            />
          );
        })}
      </ProtocolPickerSection>
    );
  });
}

export function ProtocolPickerSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="protocol-picker-section">
      <h3 className="protocol-picker-section-label">{label}</h3>
      <OsSurfaceRowList as="div" className="protocol-picker-section-list">
        {children}
      </OsSurfaceRowList>
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
    <OsSurfaceRow
      label={label}
      description={disabled && lockReason ? lockReason : hint}
      badge={isLast ? 'Last used' : undefined}
      active={isLast}
      trailing={isLast ? 'none' : 'navigate'}
      disabled={disabled}
      onClick={onSelect}
    />
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
