export function isWalletUserCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    if (typeof error === 'string') {
      const message = error.toLowerCase();
      return (
        message.includes('user rejected') ||
        message.includes('user cancelled') ||
        message.includes('user canceled')
      );
    }
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('user rejected') ||
    message.includes('user cancelled') ||
    message.includes('user canceled') ||
    message.includes('closed the window') ||
    message.includes('wallet closed')
  );
}

export function formatStandingActionError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message || message === 'Failed to fetch') {
    return 'Network error — try again in a moment.';
  }
  return message;
}

/**
 * Create-token uses UseGlobalContract. Some wallet executors still reject
 * that action type before the tx hits the chain.
 */
export function formatCreateTokenWalletError(
  error: unknown,
  fallback: string
): string {
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === 'string'
        ? error.trim()
        : '';
  if (/invalid action(\s+type)?/i.test(message)) {
    return 'Wallet rejected the deploy step. Update your wallet and try again.';
  }
  return message || fallback;
}
