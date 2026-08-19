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
