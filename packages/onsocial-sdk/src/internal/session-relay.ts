import type { Session } from '../advanced/session.js';
import { fetchAccessKeyNextNonce } from './near-access-key.js';
import { RelayExecutionError } from './http.js';
import type { Network } from '../types.js';

type SessionRelayTail = Promise<unknown>;

const relayQueues = new Map<string, SessionRelayTail>();

export type AccessKeyNonceProvider = (
  accountId: string,
  publicKey: string
) => Promise<number>;

/** @internal Test-only: clear per-session relay queues. */
export function __resetSessionRelayQueues(): void {
  relayQueues.clear();
}

function sessionRelayKey(session: Session): string {
  const accountId = session.accountId ?? 'unknown';
  const publicKey = session.key?.publicKey;
  return publicKey ? `${accountId}|${publicKey}` : accountId;
}

/** Run delegate relays for one session key strictly one at a time. */
export function runSerializedSessionRelay<T>(
  session: Session,
  fn: () => Promise<T>
): Promise<T> {
  const key = sessionRelayKey(session);
  const previous = relayQueues.get(key) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(fn)
    .finally(() => {
      if (relayQueues.get(key) === run) {
        relayQueues.delete(key);
      }
    });
  relayQueues.set(key, run);
  return run;
}

export function isDelegateNonceError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
  }
  if (error instanceof RelayExecutionError) {
    parts.push(JSON.stringify(error.raw ?? {}));
  }
  const text = parts.join(' ');
  return (
    text.includes('DelegateActionInvalidNonce') ||
    text.includes('InvalidNonce') ||
    /ak_nonce:\s*\d+/.test(text)
  );
}

/** Parse `ak_nonce` from a NEAR delegate invalid-nonce failure. */
export function parseDelegateNextNonce(error: unknown): number | null {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
  }
  if (error instanceof RelayExecutionError) {
    parts.push(JSON.stringify(error.raw ?? {}));
  }
  const match = parts.join(' ').match(/ak_nonce:\s*(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

export async function resyncSessionDelegateNonce(
  session: Session,
  error: unknown,
  opts: {
    network: Network;
    accessKeyNonceProvider?: AccessKeyNonceProvider;
  }
): Promise<void> {
  const fromError = parseDelegateNextNonce(error);
  if (fromError != null) {
    session.forceNextNonce(fromError);
    return;
  }

  const provider =
    opts.accessKeyNonceProvider ??
    ((accountId, publicKey) =>
      fetchAccessKeyNextNonce(accountId, publicKey, opts.network));

  const publicKey = session.key?.publicKey;
  if (!publicKey) {
    throw new Error('session key required to resync delegate nonce from chain');
  }
  const next = await provider(session.accountId, publicKey);
  session.forceNextNonce(next);
}
