'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import {
  PROTOCOL_CREATE_KIND_GROUPS,
  PROTOCOL_CREATE_KIND_OPTIONS,
  type ProtocolCreateKind,
} from '@/features/protocol/protocol-create';
import { getProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import {
  canProposeProtocolCreateKind,
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
  onSelectKind,
  onOpenStake,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
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

  const isGroupMember = useMemo(
    () => isProtocolDaoGroupMember(daoPolicy, accountId),
    [daoPolicy, accountId]
  );

  const availableKinds = useMemo(() => {
    if (!accountId || loadState !== 'ready') {
      return PROTOCOL_CREATE_KIND_OPTIONS;
    }
    return PROTOCOL_CREATE_KIND_OPTIONS.filter((option) =>
      canProposeProtocolCreateKind(
        daoPolicy,
        accountId,
        delegatedWeight,
        option.id
      )
    );
  }, [accountId, loadState, daoPolicy, delegatedWeight]);

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
  }, [open, daoAccountId, accountId, isGroupMember]);

  const grouped = useMemo(
    () =>
      PROTOCOL_CREATE_KIND_GROUPS.map((group) => ({
        ...group,
        options: availableKinds.filter((option) => option.group === group.id),
      })).filter((group) => group.options.length > 0),
    [availableKinds]
  );

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="os"
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

        {accountId &&
        loadState === 'ready' &&
        !canProposeAny &&
        !isGroupMember ? (
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

        {accountId &&
        loadState === 'ready' &&
        availableKinds.length === 0 &&
        (canProposeAny || isGroupMember) ? (
          <p className="protocol-compose-note is-warn">
            No proposal kinds are available for your roles on this DAO.
          </p>
        ) : null}

        {grouped.map((group) => (
          <section key={group.id} className="protocol-propose-kind-group">
            <h3 className="protocol-propose-kind-group-label">{group.label}</h3>
            <ul className="protocol-propose-kind-list">
              {group.options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="protocol-propose-kind-item"
                    disabled={
                      pendingBlocked(
                        loadState,
                        canProposeAny,
                        isGroupMember,
                        accountId
                      )
                    }
                    onClick={() => onSelectKind(option.id)}
                  >
                    <span className="protocol-propose-kind-item-label">
                      {option.label}
                    </span>
                    <span className="protocol-propose-kind-item-hint">
                      {option.hint}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </GlassSheet>
  );
}

function pendingBlocked(
  loadState: 'idle' | 'loading' | 'ready' | 'error',
  canProposeAny: boolean,
  isGroupMember: boolean,
  accountId: string | null
): boolean {
  if (!accountId) return true;
  if (loadState === 'loading' || loadState === 'error') return true;
  if (!canProposeAny && !isGroupMember) return true;
  return false;
}
