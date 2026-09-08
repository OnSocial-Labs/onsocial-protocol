import { expect, type Page } from '@playwright/test';
import { E2E_WALLET_ACCOUNT_KEY } from '../../src/lib/e2e-wallet-account';
import { COLLECTION_E2E_VIEWER } from './collection-page';
import { e2ePaintAccountId } from './e2e-signers';

/** Keep in sync with `src/lib/e2e-mock-signer.ts`. */
export const E2E_MOCK_SIGNER_KEY = 'onsocial.e2e.mockSigner';

export const E2E_MOCK_PREPARE_TARGET = 'e2e.core.testnet';

export type E2eMockSignerCall = {
  receiverId: string;
  methodName: string;
  args: unknown;
};

declare global {
  interface Window {
    __onsocialE2eSignerCalls?: E2eMockSignerCall[];
  }
}

type PreparedAction = {
  e2eVerb?: string;
  body?: unknown;
};

/**
 * Paint a connected account and opt into the recording wallet.
 * Clears leftover social sessions so compose stays on wallet broadcast.
 */
export async function seedE2eMockSigner(
  page: Page,
  accountId = e2ePaintAccountId(COLLECTION_E2E_VIEWER)
): Promise<void> {
  await page.addInitScript(
    ([walletKey, signerKey, account]) => {
      window.localStorage.setItem(walletKey, account);
      window.localStorage.setItem(signerKey, '1');
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('onsocial.app.session.')) {
          window.localStorage.removeItem(key);
        }
      }
      window.__onsocialE2eSignerCalls = [];
    },
    [E2E_WALLET_ACCOUNT_KEY, E2E_MOCK_SIGNER_KEY, accountId] as const
  );
}

/** Echo compose verb + body so the mock wallet can record the intended write. */
export async function stubE2eComposePrepare(page: Page): Promise<void> {
  await page.route('**/compose/prepare/**', async (route) => {
    const url = route.request().url();
    const verb =
      url.split('/compose/prepare/')[1]?.split('?')[0]?.replace(/\/$/, '') ??
      '';
    let body: unknown = {};
    const postData = route.request().postData();
    if (postData) {
      try {
        body = JSON.parse(postData) as unknown;
      } catch {
        body = { raw: postData };
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        action: { e2eVerb: verb, body },
        target_account: E2E_MOCK_PREPARE_TARGET,
      }),
    });
  });
}

/** Endorse upsert reads get-one before compose — return an empty slot. */
export async function stubE2eDataGetOne(page: Page): Promise<void> {
  await page.route('**/data/get-one**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ deleted: false, value: null }),
    });
  });
}

export async function readE2eSignerCalls(
  page: Page
): Promise<E2eMockSignerCall[]> {
  return page.evaluate(() => window.__onsocialE2eSignerCalls ?? []);
}

export function extractPreparedAction(
  call: E2eMockSignerCall
): PreparedAction | null {
  if (!call.args || typeof call.args !== 'object') return null;
  const request = (call.args as { request?: { action?: PreparedAction } })
    .request;
  return request?.action ?? null;
}

export async function expectE2eSignerWrite(
  page: Page,
  assert: (calls: E2eMockSignerCall[]) => void
): Promise<E2eMockSignerCall[]> {
  await expect
    .poll(async () => (await readE2eSignerCalls(page)).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  const calls = await readE2eSignerCalls(page);
  assert(calls);
  return calls;
}
