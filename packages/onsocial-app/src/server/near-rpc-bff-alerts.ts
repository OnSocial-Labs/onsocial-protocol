/**
 * Health signal for the server-side NEAR RPC path (`/api/near/rpc` BFF).
 *
 * Emits single-line logs with stable signatures so any log-based alert
 * (Vercel log drain, GCP, Grafana) can match one string:
 *
 * - `NEAR_RPC_BFF_GATEWAY_FALLBACK` — the OnSocial API-key RPC failed and the
 *   call fell through to a public node. Degraded, not user-visible.
 * - `NEAR_RPC_BFF_UPSTREAM_FAILURE` — a call failed on every upstream; the
 *   route answers 502.
 * - `NEAR_RPC_BFF_ALERT` — failures crossed {@link FAILURE_THRESHOLD} inside
 *   {@link WINDOW_MS}. This is the paging signal.
 * - `NEAR_RPC_BFF_RECOVERED` — first success after an active alert.
 *
 * State is in-memory per server instance; serverless cold starts reset it.
 * The counters exist to shape the log stream, not to be a metrics store.
 *
 * Never log request params or credentials: provider labels are reduced to
 * hostnames and messages are redacted and truncated before logging.
 */

const WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 10;
const MESSAGE_LIMIT = 160;

let failureTimestamps: number[] = [];
let alertActive = false;

let nowProvider: () => number = () => Date.now();

function providerHost(url: string): string {
  try {
    return new URL(url).host || 'unknown';
  } catch {
    return 'unknown';
  }
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/([?&](?:api[-_]?key|key|access[-_]?token)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, MESSAGE_LIMIT);
}

function pruneWindow(now: number): void {
  const cutoff = now - WINDOW_MS;
  while (failureTimestamps.length > 0 && failureTimestamps[0]! < cutoff) {
    failureTimestamps.shift();
  }
}

/** A gateway attempt failed and the call fell through to a public node. */
export function reportNearRpcBffFallback(input: {
  method: string;
  provider: string;
  message: string;
}): void {
  console.warn(
    `NEAR_RPC_BFF_GATEWAY_FALLBACK ${JSON.stringify({
      method: input.method,
      provider: providerHost(input.provider),
      message: sanitizeMessage(input.message),
    })}`
  );
}

/** A call failed on every upstream; the BFF route answers 502. */
export function reportNearRpcBffFailure(input: {
  method: string;
  network: string;
  provider: string;
  message: string;
}): void {
  const now = nowProvider();
  pruneWindow(now);
  failureTimestamps.push(now);
  const windowCount = failureTimestamps.length;

  console.error(
    `NEAR_RPC_BFF_UPSTREAM_FAILURE ${JSON.stringify({
      method: input.method,
      network: input.network,
      provider: providerHost(input.provider),
      message: sanitizeMessage(input.message),
      windowCount,
    })}`
  );

  if (!alertActive && windowCount >= FAILURE_THRESHOLD) {
    alertActive = true;
    console.error(
      `NEAR_RPC_BFF_ALERT ${JSON.stringify({
        network: input.network,
        failures: windowCount,
        windowMs: WINDOW_MS,
        threshold: FAILURE_THRESHOLD,
      })}`
    );
  }
}

/** A call succeeded. Closes an active alert. */
export function reportNearRpcBffSuccess(input: { provider: string }): void {
  if (!alertActive) return;
  alertActive = false;
  failureTimestamps = [];
  console.warn(
    `NEAR_RPC_BFF_RECOVERED ${JSON.stringify({
      provider: providerHost(input.provider),
    })}`
  );
}

/** Test-only hooks: control time and clear state between cases. */
export function __nearRpcBffAlertTestHooks() {
  return {
    setNow(next: () => number) {
      nowProvider = next;
    },
    reset() {
      failureTimestamps = [];
      alertActive = false;
      nowProvider = () => Date.now();
    },
  };
}
