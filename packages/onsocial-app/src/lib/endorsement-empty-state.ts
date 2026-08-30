import type { EndorsementsMode } from '@/lib/endorsements-panel-data';

export interface EndorsementPanelEmptyState {
  primary: string;
  secondary?: string;
  showDiscover: boolean;
}

export function buildEndorsementEmptyState({
  mode,
  isSelf,
  displayName,
  viewerEndorsed = false,
}: {
  mode: EndorsementsMode;
  isSelf: boolean;
  displayName: string;
  viewerEndorsed?: boolean;
}): EndorsementPanelEmptyState {
  if (mode === 'received') {
    return {
      primary: isSelf
        ? 'No endorsements yet.'
        : `No endorsements for ${displayName} yet.`,
      secondary:
        isSelf || viewerEndorsed
          ? undefined
          : 'Be the first to put your name behind them.',
      showDiscover: false,
    };
  }

  return {
    primary: isSelf
      ? 'You have not endorsed anyone yet.'
      : `${displayName} has not endorsed anyone yet.`,
    showDiscover: isSelf,
  };
}
