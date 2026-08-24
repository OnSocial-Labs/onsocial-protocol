'use client';

import { PenFillIcon, StarsCFillIcon } from '@onsocial/ui';
import type { ComposeLauncherEntry } from '@/contexts/compose-launcher-context';

export function PortfolioSummonComposeButton({
  compose,
}: {
  compose: ComposeLauncherEntry;
}) {
  const kind = compose.kind;
  const ariaLabel =
    kind === 'drop'
      ? 'Start a drop'
      : kind === 'mint'
        ? 'Mint'
        : kind === 'propose'
          ? 'Create a proposal'
          : 'Compose a post';

  return (
    <button
      type="button"
      className={`portfolio-summon-compose${
        kind === 'drop'
          ? ' is-drop'
          : kind === 'mint'
            ? ' is-mint'
            : kind === 'propose'
              ? ' is-propose'
              : ''
      }`}
      onClick={compose.action}
      aria-label={ariaLabel}
    >
      {kind === 'drop' || kind === 'mint' ? (
        <StarsCFillIcon className="portfolio-summon-compose-icon" aria-hidden />
      ) : (
        <PenFillIcon className="portfolio-summon-compose-icon" aria-hidden />
      )}
    </button>
  );
}
