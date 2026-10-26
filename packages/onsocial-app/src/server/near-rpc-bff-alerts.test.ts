import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __nearRpcBffAlertTestHooks,
  reportNearRpcBffFallback,
  reportNearRpcBffFailure,
  reportNearRpcBffSuccess,
} from './near-rpc-bff-alerts';

const hooks = __nearRpcBffAlertTestHooks();

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

const logged = (spy: ReturnType<typeof vi.spyOn>, signature: string) =>
  spy.mock.calls.filter(
    (call) => typeof call[0] === 'string' && call[0].startsWith(signature)
  );

beforeEach(() => {
  hooks.reset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  hooks.reset();
});

describe('near-rpc-bff-alerts', () => {
  it('logs a stable signature per failure without alerting below threshold', () => {
    for (let i = 0; i < 9; i += 1) {
      reportNearRpcBffFailure({
        method: 'query',
        network: 'testnet',
        provider: 'https://test.rpc.fastnear.com',
        message: 'boom',
      });
    }
    expect(logged(errorSpy, 'NEAR_RPC_BFF_UPSTREAM_FAILURE')).toHaveLength(9);
    expect(logged(errorSpy, 'NEAR_RPC_BFF_ALERT')).toHaveLength(0);
  });

  it('alerts once at the threshold and does not repeat within the window', () => {
    for (let i = 0; i < 15; i += 1) {
      reportNearRpcBffFailure({
        method: 'query',
        network: 'testnet',
        provider: 'https://test.rpc.fastnear.com',
        message: 'boom',
      });
    }
    expect(logged(errorSpy, 'NEAR_RPC_BFF_ALERT')).toHaveLength(1);
  });

  it('recovers on the first success after an alert, then can alert again', () => {
    for (let i = 0; i < 10; i += 1) {
      reportNearRpcBffFailure({
        method: 'query',
        network: 'testnet',
        provider: 'https://test.rpc.fastnear.com',
        message: 'boom',
      });
    }
    reportNearRpcBffSuccess({ provider: 'https://test.rpc.fastnear.com' });
    expect(logged(warnSpy, 'NEAR_RPC_BFF_RECOVERED')).toHaveLength(1);

    for (let i = 0; i < 10; i += 1) {
      reportNearRpcBffFailure({
        method: 'query',
        network: 'testnet',
        provider: 'https://test.rpc.fastnear.com',
        message: 'boom',
      });
    }
    expect(logged(errorSpy, 'NEAR_RPC_BFF_ALERT')).toHaveLength(2);
  });

  it('does not let old failures outside the window trip the alert', () => {
    let now = 1_000_000;
    hooks.setNow(() => now);

    for (let i = 0; i < 9; i += 1) {
      reportNearRpcBffFailure({
        method: 'query',
        network: 'testnet',
        provider: 'https://test.rpc.fastnear.com',
        message: 'boom',
      });
    }
    now += 61_000;
    reportNearRpcBffFailure({
      method: 'query',
      network: 'testnet',
      provider: 'https://test.rpc.fastnear.com',
      message: 'boom',
    });
    expect(logged(errorSpy, 'NEAR_RPC_BFF_ALERT')).toHaveLength(0);
  });

  it('logs gateway fallbacks without counting them toward the alert', () => {
    for (let i = 0; i < 20; i += 1) {
      reportNearRpcBffFallback({
        method: 'query',
        provider: 'https://testnet.onsocial.id/v1/rpc',
        message: 'HTTP 503',
      });
    }
    expect(logged(warnSpy, 'NEAR_RPC_BFF_GATEWAY_FALLBACK')).toHaveLength(20);
    expect(logged(errorSpy, 'NEAR_RPC_BFF_ALERT')).toHaveLength(0);
  });

  it('reduces providers to hostnames and redacts keys in messages', () => {
    reportNearRpcBffFailure({
      method: 'query',
      network: 'testnet',
      provider: 'https://test.rpc.fastnear.com/some/path',
      message: 'failed https://x.test/?api_key=SECRETVALUE123 after 3 tries',
    });
    const line = String(errorSpy.mock.calls[0]?.[0]);
    expect(line).toContain('"provider":"test.rpc.fastnear.com"');
    expect(line).not.toContain('SECRETVALUE123');
    expect(line).toContain('[redacted]');
  });
});
