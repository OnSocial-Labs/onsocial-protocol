import {
  formatRelativePostTimestamp,
  socialTimeProps,
} from '@/lib/post-display';

/**
 * Quiet added stamp — `now`, `5m`, `2h`, `3d`, then `Mar 12`.
 * Rows stay the bare stamp. The opened offer says `Added 2d` (or `Just now`).
 */
export function OfferAddedTime({
  since,
  labeled = false,
  className = 'standing-row-time',
}: {
  since: number | null;
  /** `Added 2d` when the stamp is not sitting opposite a title. */
  labeled?: boolean;
  className?: string;
}) {
  if (since == null || !Number.isFinite(since) || since <= 0) return null;
  const stamp = formatRelativePostTimestamp(since);
  if (!stamp || stamp === 'Unknown time') return null;
  const label = !labeled ? stamp : stamp === 'now' ? 'Just now' : `Added ${stamp}`;
  return (
    <time className={className} {...socialTimeProps(since)}>
      {label}
    </time>
  );
}
