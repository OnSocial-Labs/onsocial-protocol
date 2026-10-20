import { describe, expect, it } from 'vitest';

import {
  chooseSessionKeyAllowanceYocto,
  FULL_SESSION_KEY_ALLOWANCE_YOCTO,
  resolveAppConnectRoute,
  SPONSORED_SESSION_KEY_ALLOWANCE_YOCTO,
  accountNeedsSessionSponsor,
} from '@/lib/app-session-sponsor';

describe('accountNeedsSessionSponsor', () => {
  it('sponsors a missing account and a balance under the gift threshold', () => {
    expect(accountNeedsSessionSponsor(null)).toBe(true);
    expect(accountNeedsSessionSponsor(12_000_000_000_000_000_000_000n)).toBe(
      true
    );
    expect(accountNeedsSessionSponsor(13_000_000_000_000_000_000_000n)).toBe(
      false
    );
  });
});

describe('chooseSessionKeyAllowanceYocto', () => {
  it('keeps the full allowance when the account can lock it', () => {
    expect(
      chooseSessionKeyAllowanceYocto(
        FULL_SESSION_KEY_ALLOWANCE_YOCTO + 5_000_000_000_000_000_000_000n
      )
    ).toBe(FULL_SESSION_KEY_ALLOWANCE_YOCTO.toString());
  });

  it('uses the gift-sized allowance for an empty or topped-up account', () => {
    expect(chooseSessionKeyAllowanceYocto(null)).toBe(
      SPONSORED_SESSION_KEY_ALLOWANCE_YOCTO.toString()
    );
    expect(
      chooseSessionKeyAllowanceYocto(15_000_000_000_000_000_000_000n)
    ).toBe(SPONSORED_SESSION_KEY_ALLOWANCE_YOCTO.toString());
  });
});

describe('resolveAppConnectRoute', () => {
  const pending = { sessionReady: false, hasPendingKey: true } as const;

  it('bundles the key into the first connect for a known funded account', () => {
    expect(
      resolveAppConnectRoute({
        ...pending,
        forcePicker: false,
        hasStoredHint: true,
        alreadyConnected: false,
        needsSponsor: false,
      })
    ).toEqual({ bundleSessionKey: true, openingToast: 'wallet' });
  });

  it('lets an empty account pick a destination before the gift', () => {
    expect(
      resolveAppConnectRoute({
        ...pending,
        forcePicker: false,
        hasStoredHint: true,
        alreadyConnected: false,
        needsSponsor: true,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'none' });
  });

  it('starts a connected empty wallet on the setup toast', () => {
    expect(
      resolveAppConnectRoute({
        ...pending,
        forcePicker: false,
        hasStoredHint: true,
        alreadyConnected: true,
        needsSponsor: true,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'setup' });
  });

  it('does not bundle a key into the switch-wallet picker', () => {
    expect(
      resolveAppConnectRoute({
        ...pending,
        forcePicker: true,
        hasStoredHint: true,
        alreadyConnected: false,
        needsSponsor: false,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'none' });
  });
});
