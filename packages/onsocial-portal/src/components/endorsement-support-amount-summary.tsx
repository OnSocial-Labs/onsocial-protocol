'use client';

export function EndorsementSupportAmountSummary({
  amountLabel,
  spendCount,
  timeLabel,
  className,
}: {
  amountLabel: string;
  spendCount: number;
  timeLabel: string;
  className?: string;
}) {
  const showSends = spendCount > 1;
  const showMeta = showSends || Boolean(timeLabel);

  return (
    <span className={className ?? 'shrink-0 pl-2 text-right'}>
      <span className="block tabular-nums">
        <span className="portal-type-lead font-semibold text-[var(--portal-green)]">
          {amountLabel}
        </span>
        <span className="portal-type-caption font-medium text-muted-foreground/55">
          {' '}
          SOCIAL
        </span>
      </span>
      {showMeta ? (
        <span className="mt-0.5 block portal-type-caption tabular-nums text-muted-foreground/45">
          {showSends ? (
            <span>
              {spendCount} send{spendCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {showSends && timeLabel ? <span aria-hidden="true"> · </span> : null}
          {timeLabel ? <span>{timeLabel}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
