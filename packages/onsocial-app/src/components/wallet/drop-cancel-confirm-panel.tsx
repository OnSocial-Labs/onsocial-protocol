'use client';

import { useEffect, useMemo, useState } from 'react';
import { OsActionDrawerConfirm, osFieldBorderedClassName } from '@onsocial/ui';
import { fetchCollectionRedeemAttendance } from '@/features/scarces/ticket-attendance';
import {
  DEFAULT_REFUND_CLAIM_DAYS,
  MIN_REFUND_CLAIM_DAYS,
  refundPoolDepositNearLabel,
  refundableTokenCount,
} from '@/features/scarces/drop-refund';
import { dropCancelConfirmCopy } from '@/lib/drop-cancel-confirm-copy';

interface DropCancelConfirmPanelProps {
  collectionId: string;
  title?: string | null;
  minted: number;
  /** Ask price hint — prefill refund per token when set. */
  priceNear?: string | null;
  pending?: boolean;
  onConfirm: (input: {
    refundPerTokenNear: string;
    claimDays: number;
    refundableCount: number;
  }) => void;
  onCancel: () => void;
}

function normalizeNearInput(raw: string): string {
  const trimmed = raw.trim().replace(/,/g, '');
  if (!trimmed) return '';
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return '';
  return trimmed;
}

/** Cancel-drop form body for ActionDrawer — amount + claim window. */
export function DropCancelConfirmPanel({
  collectionId,
  title,
  minted,
  priceNear = null,
  pending = false,
  onConfirm,
  onCancel,
}: DropCancelConfirmPanelProps) {
  const [refundNear, setRefundNear] = useState(
    () => priceNear?.trim() || '0'
  );
  const [claimDays, setClaimDays] = useState(String(DEFAULT_REFUND_CLAIM_DAYS));
  const [fullyRedeemed, setFullyRedeemed] = useState(0);
  const [attendanceReady, setAttendanceReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchCollectionRedeemAttendance(collectionId)
      .then((stats) => {
        if (cancelled) return;
        setFullyRedeemed(stats?.fullyRedeemedCount ?? 0);
        setAttendanceReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFullyRedeemed(0);
          setAttendanceReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  const refundable = refundableTokenCount(minted, fullyRedeemed);
  const normalizedNear = normalizeNearInput(refundNear);
  const daysNum = Number.parseInt(claimDays, 10);
  const claimDaysSafe = Number.isFinite(daysNum)
    ? Math.max(MIN_REFUND_CLAIM_DAYS, daysNum)
    : DEFAULT_REFUND_CLAIM_DAYS;
  const depositLabel = useMemo(
    () =>
      normalizedNear
        ? refundPoolDepositNearLabel(normalizedNear, refundable)
        : '0',
    [normalizedNear, refundable]
  );

  const copy = dropCancelConfirmCopy({
    title,
    refundableCount: refundable,
    depositNearLabel: depositLabel,
    claimDays: claimDaysSafe,
  });

  const nearOk =
    normalizedNear !== '' && Number.parseFloat(normalizedNear) >= 0;
  const daysOk = Number.isFinite(daysNum) && daysNum >= MIN_REFUND_CLAIM_DAYS;
  const canSubmit = attendanceReady && nearOk && daysOk && !pending;

  return (
    <OsActionDrawerConfirm
      body={copy.body}
      confirmLabel={copy.confirmLabel}
      pending={pending}
      pendingLabel="Canceling…"
      variant="danger"
      onConfirm={() => {
        if (!canSubmit || !normalizedNear) return;
        onConfirm({
          refundPerTokenNear: normalizedNear,
          claimDays: claimDaysSafe,
          refundableCount: refundable,
        });
      }}
      onCancel={onCancel}
    >
      <label className="drop-cancel-field">
        <span className="drop-cancel-field-label">Refund per ticket (NEAR)</span>
        <input
          className={osFieldBorderedClassName}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={pending}
          value={refundNear}
          onChange={(event) => setRefundNear(event.target.value)}
          placeholder="0"
        />
      </label>
      <label className="drop-cancel-field">
        <span className="drop-cancel-field-label">
          Claim window (days, min {MIN_REFUND_CLAIM_DAYS})
        </span>
        <input
          className={osFieldBorderedClassName}
          type="number"
          min={MIN_REFUND_CLAIM_DAYS}
          step={1}
          disabled={pending}
          value={claimDays}
          onChange={(event) => setClaimDays(event.target.value)}
        />
      </label>
      {!attendanceReady ? (
        <p className="drop-cancel-meta">Checking redeem totals…</p>
      ) : (
        <p className="drop-cancel-meta">
          {refundable === 0
            ? 'Refundable tickets: 0'
            : `Refundable tickets: ${refundable} · Pool ${depositLabel} NEAR`}
        </p>
      )}
    </OsActionDrawerConfirm>
  );
}
