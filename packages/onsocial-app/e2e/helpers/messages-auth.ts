import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import type { Page } from '@playwright/test';
import {
  NOTIFICATIONS_E2E_ACCOUNT,
  seedAuthenticatedNotifications,
} from './notifications-auth';

export const MESSAGES_E2E_PEER = 'bob.testnet';
export const MESSAGES_E2E_THREAD = `${NOTIFICATIONS_E2E_ACCOUNT}::${MESSAGES_E2E_PEER}`;

const DM_STORAGE_PREFIX = 'onsocial.app.dm.';
const E2E_DM_KEY_PAIR = nacl.box.keyPair();
export const MESSAGES_E2E_PUBLIC_KEY = encodeBase64(E2E_DM_KEY_PAIR.publicKey);

/**
 * Seeds the normal authenticated session plus an already-unlocked local DM
 * identity. The gateway and profile reads remain test-stubbed; no wallet or
 * chain write is performed.
 */
export async function seedAuthenticatedMessages(page: Page): Promise<void> {
  await seedAuthenticatedNotifications(page);

  await page.addInitScript(
    ([storagePrefix, accountId, identity]) => {
      window.localStorage.setItem(
        `${storagePrefix}${accountId.toLowerCase()}`,
        JSON.stringify(identity)
      );
    },
    [
      DM_STORAGE_PREFIX,
      NOTIFICATIONS_E2E_ACCOUNT,
      {
        accountId: NOTIFICATIONS_E2E_ACCOUNT,
        publicKey: MESSAGES_E2E_PUBLIC_KEY,
        secretKey: encodeBase64(E2E_DM_KEY_PAIR.secretKey),
        wrapped: {
          ciphertext: 'e2e-wrapped-secret',
          nonce: 'e2e-wrap-nonce',
        },
        createdAt: '2026-09-10T09:00:00.000Z',
      },
    ] as const
  );
}
