'use client';

import { PenFillIcon, StarsCFillIcon } from '@onsocial/ui';
import type {
  ComposeKind,
  ComposeLauncherEntry,
} from '@/contexts/compose-launcher-context';

export function composeDockAriaLabel(kind: ComposeKind): string {
  switch (kind) {
    case 'drop':
      return 'Start a drop';
    case 'mint':
      return 'Mint';
    case 'propose':
      return 'Create a proposal';
    case 'announce':
      return 'Post this drop';
    default:
      return 'Compose a post';
  }
}

export function PortfolioSummonComposeButton({
  compose,
}: {
  compose: ComposeLauncherEntry;
}) {
  const kind = compose.kind;
  const ariaLabel = composeDockAriaLabel(kind);

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
