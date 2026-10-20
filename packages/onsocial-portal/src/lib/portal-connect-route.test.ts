import { describe, expect, it } from 'vitest';

import {
  portalConnectCanBundleSessionKey,
  portalSessionToastAfterWalletApproval,
  portalSessionToastForOpening,
  resolvePortalConnectRoute,
} from '@/lib/portal-connect-route';

describe('portalConnectCanBundleSessionKey', () => {
  it('bundles only a pending key on an account that can already pay for AddKey', () => {
    expect(
      portalConnectCanBundleSessionKey({
        sessionReady: false,
        needsWelcomeNear: false,
        hasPendingKey: true,
      })
    ).toBe(true);
    expect(
      portalConnectCanBundleSessionKey({
        sessionReady: false,
        needsWelcomeNear: true,
        hasPendingKey: true,
      })
    ).toBe(false);
    expect(
      portalConnectCanBundleSessionKey({
        sessionReady: true,
        needsWelcomeNear: false,
        hasPendingKey: true,
      })
    ).toBe(false);
    expect(
      portalConnectCanBundleSessionKey({
        sessionReady: false,
        needsWelcomeNear: false,
        hasPendingKey: false,
      })
    ).toBe(false);
  });
});

describe('resolvePortalConnectRoute', () => {
  const pending = {
    sessionReady: false,
    hasPendingKey: true,
  } as const;

  it('approves the key inside the first connect for a known funded account', () => {
    expect(
      resolvePortalConnectRoute({
        ...pending,
        forcePicker: false,
        hasStoredHint: true,
        alreadyConnected: false,
        needsWelcomeNear: false,
      })
    ).toEqual({ bundleSessionKey: true, openingToast: 'wallet' });
  });

  it('lets an empty account pick a destination before the gift', () => {
    expect(
      resolvePortalConnectRoute({
        ...pending,
        forcePicker: false,
        hasStoredHint: true,
        alreadyConnected: false,
        needsWelcomeNear: true,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'none' });
  });

  it('does not bundle a key into the switch-wallet picker', () => {
    expect(
      resolvePortalConnectRoute({
        ...pending,
        forcePicker: true,
        hasStoredHint: true,
        alreadyConnected: false,
        needsWelcomeNear: false,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'none' });
  });

  it('does not bundle when the account is still unknown', () => {
    expect(
      resolvePortalConnectRoute({
        ...pending,
        forcePicker: false,
        hasStoredHint: false,
        alreadyConnected: false,
        needsWelcomeNear: false,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'none' });
  });

  it('starts a connected funded wallet on the approval toast', () => {
    expect(
      resolvePortalConnectRoute({
        ...pending,
        forcePicker: false,
        hasStoredHint: true,
        alreadyConnected: true,
        needsWelcomeNear: false,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'wallet' });
  });

  it('starts a connected empty wallet on the setup toast', () => {
    expect(
      resolvePortalConnectRoute({
        ...pending,
        forcePicker: false,
        hasStoredHint: true,
        alreadyConnected: true,
        needsWelcomeNear: true,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'setup' });
  });

  it('stays quiet when the session is already ready', () => {
    expect(
      resolvePortalConnectRoute({
        forcePicker: false,
        hasStoredHint: true,
        alreadyConnected: false,
        sessionReady: true,
        needsWelcomeNear: false,
        hasPendingKey: false,
      })
    ).toEqual({ bundleSessionKey: false, openingToast: 'none' });
  });
});

describe('portal session toast phases', () => {
  it('uses the setup line only for the gift, then keeps the approval line', () => {
    expect(portalSessionToastForOpening('none')).toBeNull();
    expect(portalSessionToastForOpening('setup')).toEqual({
      pendingPhase: 'chain',
      pendingMessage: 'settingUpSession',
    });
    expect(portalSessionToastForOpening('wallet')).toEqual({
      pendingPhase: 'wallet',
      pendingMessage: 'approveInWallet',
    });
    expect(portalSessionToastAfterWalletApproval()).toEqual({
      pendingPhase: 'chain',
      pendingMessage: 'approveInWallet',
    });
  });
});
