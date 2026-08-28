'use client';

import { TrophyFillIcon } from '@onsocial/ui';

export function RallyLauncherMark({
  label,
  nudge,
  ariaLabel,
  onClick,
}: {
  label: string;
  nudge: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`os-launcher-rally-mark${nudge ? ' is-nudge' : ''}`}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <TrophyFillIcon className="os-launcher-rally-mark-icon" aria-hidden />
      <span className="os-launcher-rally-mark-label">{label || 'Rally'}</span>
    </button>
  );
}
