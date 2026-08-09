'use client';

import { useEffect, useId, useState } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { formatSocialCompact } from '@/lib/format-social-balance';

export function ProtocolCreateSheet({
  open,
  onClose,
  daoAccountId,
  accountId,
  pending,
  onSubmit,
  onOpenStake,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  pending: boolean;
  onSubmit: (description: string) => void;
  onOpenStake: () => void;
}) {
  const titleId = useId();
  const fieldId = useId();
  const [description, setDescription] = useState('');
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );

  useEffect(() => {
    if (!open) {
      setDescription('');
      setEligibility(null);
      setLoadState('idle');
      return;
    }
    if (!daoAccountId || !accountId) {
      setEligibility(null);
      setLoadState('ready');
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    void getProtocolGovernanceEligibility(accountId, daoAccountId)
      .then((next) => {
        if (cancelled) return;
        setEligibility(next);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setEligibility(null);
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId, accountId]);

  const canPropose =
    loadState === 'error' ? true : eligibility?.canPropose === true;
  const needsStake =
    loadState === 'ready' && eligibility != null && !eligibility.canPropose;
  const trimmed = description.trim();
  const bondLabel = eligibility?.proposalBond
    ? `${yoctoToNear(eligibility.proposalBond)} NEAR`
    : null;
  const shortfall =
    eligibility && BigInt(eligibility.remainingToThreshold) > 0n
      ? formatSocialCompact(eligibility.remainingToThreshold)
      : null;

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="os"
      initialDetent="peek"
      peekRatio={0.58}
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close propose"
      bodyClassName="protocol-action-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Propose signal"
            subtitle={daoAccountId ? `@${daoAccountId}` : undefined}
            onClose={onClose}
            closeAriaLabel="Close propose"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          {needsStake ? (
            <OsSheetAction
              type="button"
              variant="primary"
              ready={!pending}
              disabled={pending}
              onClick={onOpenStake}
            >
              Stake to propose
            </OsSheetAction>
          ) : (
            <OsSheetAction
              type="button"
              variant="primary"
              ready={
                !pending &&
                Boolean(trimmed) &&
                Boolean(accountId) &&
                (canPropose || loadState === 'error')
              }
              disabled={
                pending ||
                !trimmed ||
                !accountId ||
                loadState === 'loading' ||
                (!canPropose && loadState !== 'error')
              }
              pending={pending}
              pendingLabel="Submitting…"
              onClick={() => onSubmit(trimmed)}
            >
              Submit signal
            </OsSheetAction>
          )}
        </OsSheetActions>
      }
    >
      <div className="protocol-compose">
        <p className="protocol-action-lede">
          Posts a Sputnik signal vote on this DAO. No contract call — just the
          question for council review.
        </p>

        {!accountId ? (
          <p className="protocol-empty">Connect a wallet to propose.</p>
        ) : null}

        {accountId && loadState === 'loading' ? (
          <p className="protocol-empty">Checking proposal threshold…</p>
        ) : null}

        {accountId && loadState === 'error' ? (
          <p className="protocol-empty">
            Could not load eligibility. You can still draft, then retry submit.
          </p>
        ) : null}

        {needsStake ? (
          <p className="protocol-compose-note is-warn">
            Need {shortfall ?? 'more'} SOCIAL delegated to propose
            {bondLabel ? ` · bond ${bondLabel}` : ''}.
          </p>
        ) : null}

        {eligibility && canPropose && bondLabel ? (
          <p className="protocol-compose-note">Bond {bondLabel} on submit.</p>
        ) : null}

        <label className="protocol-field" htmlFor={fieldId}>
          <span>Signal</span>
          <textarea
            id={fieldId}
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What should the DAO decide?"
            disabled={pending}
          />
        </label>

        {eligibility ? (
          <dl className="protocol-action-facts">
            <div>
              <dt>Delegated</dt>
              <dd>
                {formatSocialCompact(eligibility.delegatedWeight)} /{' '}
                {formatSocialCompact(eligibility.requiredWeight)} SOCIAL
              </dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>
                {formatSocialCompact(eligibility.walletBalance)} SOCIAL ·{' '}
                {yoctoToNear(eligibility.nearBalance)} NEAR
              </dd>
            </div>
          </dl>
        ) : null}
      </div>
    </GlassSheet>
  );
}
