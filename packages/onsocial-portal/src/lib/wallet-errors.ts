export function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

export class WalletActionCancelledError extends Error {
  constructor() {
    super('');
    this.name = 'WalletActionCancelledError';
  }
}

function hasWalletActionCancelledName(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as Error).name === 'WalletActionCancelledError'
  );
}

export function isWalletUserCancellation(error: unknown): boolean {
  if (error instanceof WalletActionCancelledError) return true;
  if (hasWalletActionCancelledName(error)) return true;

  const message = getRawErrorMessage(error).toLowerCase();
  if (!message) return false;

  return (
    message === 'walletactioncancelled' ||
    message === 'user rejected' ||
    message === 'iframe not loaded' ||
    message.includes('closed the window') ||
    message.includes('before completing the action') ||
    message.includes('wallet closed') ||
    message.includes('user cancelled') ||
    message.includes('user canceled') ||
    message.includes('action was cancelled') ||
    message.includes('action was canceled') ||
    message.includes('request rejected') ||
    message.includes('confirmation declined') ||
    (message.includes('cancelled') && message.includes('wallet')) ||
    (message.includes('canceled') && message.includes('wallet'))
  );
}

export function isWalletCancellationMessage(
  message: string | null | undefined
): boolean {
  if (!message?.trim()) return false;
  return isWalletUserCancellation(new Error(message));
}

export function formatWalletActionError(error: unknown): string {
  if (isWalletUserCancellation(error)) return '';

  const raw = getRawErrorMessage(error);
  const lower = raw.toLowerCase();

  if (lower.includes('permission denied')) return 'Wallet permission denied';
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Wallet request timed out';
  }
  if (lower.includes('network') || lower.includes('fetch failed')) {
    return 'Network error — check your connection';
  }

  return raw || 'Something went wrong';
}

export function isIgnorableWalletError(error: unknown): boolean {
  return isWalletUserCancellation(error);
}

export function rethrowWalletActionError(error: unknown): never {
  if (isWalletUserCancellation(error)) {
    throw new WalletActionCancelledError();
  }

  if (error instanceof Error) throw error;
  throw new Error(getRawErrorMessage(error) || 'Something went wrong');
}

export function reportWalletActionFailure(
  error: unknown,
  onError: (message: string) => void
): void {
  if (isWalletUserCancellation(error)) return;

  const message = formatWalletActionError(error);
  if (!message) return;
  onError(message);
}
