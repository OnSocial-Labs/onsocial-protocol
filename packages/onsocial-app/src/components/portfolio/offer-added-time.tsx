import {
  formatRelativePostTimestamp,
  socialTimeProps,
} from '@/lib/post-display';

/** Quiet added stamp — `now`, `5m`, `2h`, `3d`, then `Mar 12`. No extra word. */
export function OfferAddedTime({
  since,
  className = 'standing-row-time',
}: {
  since: number | null;
  className?: string;
}) {
  if (since == null || !Number.isFinite(since) || since <= 0) return null;
  const label = formatRelativePostTimestamp(since);
  if (!label || label === 'Unknown time') return null;
  return (
    <time className={className} {...socialTimeProps(since)}>
      {label}
    </time>
  );
}
