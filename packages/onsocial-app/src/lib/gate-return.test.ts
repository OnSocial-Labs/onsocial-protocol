import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  APP_WALLET_ACCOUNT_STORAGE_KEY,
  gateReturnHref,
  gateReturnScript,
} from '@/lib/gate-return';

function runReturn(options: {
  pathname?: string;
  search?: string;
  stored?: string | null;
}) {
  let replaced: string | null = null;
  const context = vm.createContext({
    URLSearchParams,
    document: {
      documentElement: {
        getAttribute() {
          return null;
        },
        setAttribute() {},
      },
    },
    location: {
      pathname: options.pathname ?? '/',
      search: options.search ?? '',
      replace(url: string) {
        replaced = url;
      },
    },
    localStorage: {
      getItem(key: string) {
        if (key !== APP_WALLET_ACCOUNT_STORAGE_KEY) return null;
        return options.stored ?? null;
      },
    },
  });
  vm.runInContext(gateReturnScript, context);
  return replaced;
}

describe('gate return', () => {
  it('opens the same page as gateContinuePath', () => {
    expect(gateReturnHref('alice.testnet', '')).toBe('/@alice.testnet');
    expect(gateReturnHref('alice.testnet', '?sheet=boost')).toBe(
      '/@alice.testnet?sheet=boost'
    );
    expect(gateReturnHref('alice.testnet', '?sheet=rally')).toBe(
      '/@alice.testnet?sheet=rally'
    );
    expect(gateReturnHref('alice.testnet', '?sheet=other')).toBe(
      '/@alice.testnet'
    );
    expect(gateReturnHref('../evil', '')).toBeNull();
    expect(runReturn({ stored: 'alice.testnet' })).toBe('/@alice.testnet');
    expect(runReturn({ stored: 'alice.testnet', search: '?sheet=boost' })).toBe(
      '/@alice.testnet?sheet=boost'
    );
    expect(runReturn({ stored: 'alice.testnet', search: '?sheet=rally' })).toBe(
      '/@alice.testnet?sheet=rally'
    );
  });

  it('stays on the gate without a stored account or off the landing path', () => {
    expect(runReturn({ stored: null })).toBeNull();
    expect(runReturn({ stored: 'not an id' })).toBeNull();
    expect(
      runReturn({ pathname: '/@alice.testnet', stored: 'alice.testnet' })
    ).toBeNull();
  });
});
