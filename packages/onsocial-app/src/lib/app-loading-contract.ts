/**
 * Loading states shared by app pages.
 *
 * A page may render a different component for each presentation, but the
 * transition contract stays stable: cold data gets structure, painted data
 * stays painted, and errors never replace rows that are already visible.
 */
export type AppLoadingPhase =
  | 'cold'
  | 'refreshing'
  | 'appending'
  | 'empty'
  | 'error';

export type AppLoadingPresentation =
  | 'skeleton'
  | 'preserve'
  | 'append-skeleton'
  | 'state'
  | 'overlay';

export function resolveAppLoadingPresentation(
  phase: AppLoadingPhase,
  options: { hasPaintedRows?: boolean } = {}
): AppLoadingPresentation {
  const hasPaintedRows = options.hasPaintedRows === true;

  switch (phase) {
    case 'cold':
      return hasPaintedRows ? 'preserve' : 'skeleton';
    case 'refreshing':
      return hasPaintedRows ? 'preserve' : 'skeleton';
    case 'appending':
      return 'append-skeleton';
    case 'empty':
      return 'state';
    case 'error':
      return hasPaintedRows ? 'overlay' : 'state';
  }
}

/** Ignore a response when a newer load owns the page state. */
export function isCurrentLoadingRequest(
  currentRequestId: number,
  responseRequestId: number
): boolean {
  return currentRequestId === responseRequestId;
}
