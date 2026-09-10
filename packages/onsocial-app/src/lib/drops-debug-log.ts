export function writeDropsDebugLog(
  hypothesisId: string,
  message: string,
  data: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return;
  void fetch('/api/debug-ui-log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hypothesisId,
      location: 'drops-ui-runtime',
      message,
      data,
      timestamp: Date.now(),
    }),
    keepalive: true,
  }).catch(() => undefined);
}
