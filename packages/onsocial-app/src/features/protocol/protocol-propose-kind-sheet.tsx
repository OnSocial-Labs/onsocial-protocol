'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import {
  PROTOCOL_CREATE_KIND_COMMON,
  PROTOCOL_CREATE_KIND_GROUPS,
  PROTOCOL_CREATE_KIND_OPTIONS,
  readLastProtocolCreateKind,
  rememberProtocolCreateKind,
  type ProtocolCreateKind,
} from '@/features/protocol/protocol-create';
import { getProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import {
  canProposeProtocolCreateKind,
  getProtocolCreateKindLockReason,
  isProtocolDaoGroupMember,
} from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { formatSocialCompact } from '@/lib/format-social-balance';

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
  const titleId = useId();
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [delegatedWeight, setDelegatedWeight] = useState('0');
  const [canProposeAny, setCanProposeAny] = useState(true);
  const [remainingLabel, setRemainingLabel] = useState<string | null>(null);
  const [highlightedKind, setHighlightedKind] =
    useState<ProtocolCreateKind | null>(lastKind);

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
    setHighlightedKind(lastKind ?? readLastProtocolCreateKind());
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
  }, [open, daoAccountId, accountId, isGroupMember, lastKind]);

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
      backdropLabel="Close propose"
      bodyClassName="protocol-action-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Propose"
            subtitle="Choose what to put on-chain."
            onClose={onClose}
            closeAriaLabel="Close propose"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="protocol-propose-kind">
        {!accountId ? (
          <p className="protocol-empty">Connect a wallet to propose.</p>
        ) : null}

        {accountId && loadState === 'loading' ? (
          <p className="protocol-empty">Checking what you can propose…</p>
        ) : null}

        {accountId && loadState === 'error' ? (
          <p className="protocol-compose-note is-warn">
            Could not verify proposal eligibility. Close and try again.
          </p>
        ) : null}

        {stakeBlocked ? (
          <div className="protocol-propose-kind-block">
            <p className="protocol-compose-note is-warn">
              Need {remainingLabel ?? 'more'} SOCIAL delegated to propose.
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

        <KindSection
          label="Common"
          options={commonOptions}
          accountId={accountId}
          loadState={loadState}
          daoPolicy={daoPolicy}
          delegatedWeight={delegatedWeight}
          canProposeAny={canProposeAny}
          isGroupMember={isGroupMember}
          remainingLabel={remainingLabel}
          highlightedKind={highlightedKind}
          onSelectKind={(kind) => {
            rememberProtocolCreateKind(kind);
            onSelectKind(kind);
          }}
        />

        {grouped.map((group) => (
          <KindSection
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
            highlightedKind={highlightedKind}
            onSelectKind={(kind) => {
              rememberProtocolCreateKind(kind);
              onSelectKind(kind);
            }}
          />
        ))}
      </div>
    </GlassSheet>
  );
}

function KindSection({
  label,
  options,
  accountId,
  loadState,
  daoPolicy,
  delegatedWeight,
  canProposeAny,
  isGroupMember,
  remainingLabel,
  highlightedKind,
  onSelectKind,
}: {
  label: string;
  options: typeof PROTOCOL_CREATE_KIND_OPTIONS;
  accountId: string | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  daoPolicy: ProtocolDaoPolicy | null;
  delegatedWeight: string;
  canProposeAny: boolean;
  isGroupMember: boolean;
  remainingLabel: string | null;
  highlightedKind: ProtocolCreateKind | null;
  onSelectKind: (kind: ProtocolCreateKind) => void;
}) {
  if (options.length === 0) return null;

  return (
    <section className="protocol-propose-kind-group">
      <h3 className="protocol-propose-kind-group-label">{label}</h3>
      <ul className="protocol-propose-kind-list">
        {options.map((option) => {
          const canProposeKind =
            Boolean(accountId) &&
            loadState === 'ready' &&
            canProposeProtocolCreateKind(
              daoPolicy,
              accountId,
              delegatedWeight,
              option.id
            );
          const lockReason =
            loadState === 'ready'
              ? getProtocolCreateKindLockReason({
                  kind: option.id,
                  accountId,
                  canProposeAny,
                  isGroupMember,
                  remainingLabel,
                  canProposeKind,
                })
              : loadState === 'loading'
                ? 'Checking…'
                : loadState === 'error'
                  ? 'Unavailable'
                  : accountId
                    ? null
                    : 'Connect a wallet';
          const disabled = Boolean(lockReason);
          const isLast = highlightedKind === option.id;

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
                onClick={() => onSelectKind(option.id)}
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
