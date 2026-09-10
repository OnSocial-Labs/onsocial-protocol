import { appendFileSync, mkdirSync } from 'node:fs';
import {
  generateEd25519Key,
  sessionId,
} from '../../../onsocial-sdk/dist/advanced/index.js';
import type { Page } from '@playwright/test';
import { e2ePaintAccountId } from './e2e-signers';
import { E2E_WALLET_ACCOUNT_KEY } from '../../src/lib/e2e-wallet-account';
import { E2E_AUTH_SESSION_KEY } from '../../src/lib/e2e-mock-signer';

export const NOTIFICATIONS_E2E_ACCOUNT = e2ePaintAccountId(
  'alice.testnet'
);

const SESSION_PREFIX = 'onsocial.app.session.';
const GATEWAY_JWT_PREFIX = 'onsocial.app.gateway.jwt.';
const CORE_TESTNET = 'core.onsocial.testnet';

function encodeBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function e2eGatewayToken(accountId: string): string {
  return [
    encodeBase64Url({ alg: 'none', typ: 'JWT' }),
    encodeBase64Url({
      accountId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
    'e2e',
  ].join('.');
}

/**
 * Seeds a real restorable App session while keeping wallet signing paint-only.
 * The app still runs its normal session restore and gateway-authenticated
 * Notifications client path; only the access-key lookup is stubbed by tests.
 */
export async function seedAuthenticatedNotifications(page: Page): Promise<void> {
  mkdirSync('/opt/cursor/logs', { recursive: true });
  const sessionKey = await generateEd25519Key();
  const path = `${NOTIFICATIONS_E2E_ACCOUNT}/`;
  const storedSession = {
    v: 2 as const,
    accountId: NOTIFICATIONS_E2E_ACCOUNT,
    contract: 'core' as const,
    contractId: CORE_TESTNET,
    network: 'testnet' as const,
    publicKey: sessionKey.publicKey,
    secretSeedB64u: sessionKey.secretSeedB64u,
    path,
    lastNonce: 0,
    expiresAtMs: Date.now() + 60 * 60 * 1000,
  };
  const storageId = sessionId(
    NOTIFICATIONS_E2E_ACCOUNT,
    'core',
    path
  );
  const token = e2eGatewayToken(NOTIFICATIONS_E2E_ACCOUNT);

  // #region agent log
  page.on('console', (message) => {
    const text = message.text();
    if (!text.includes('"hypothesisId"')) return;
    appendFileSync('/opt/cursor/logs/debug.log', `${text}\n`);
  });
  // #endregion

  await page.route('**/api/near/rpc', async (route) => {
    const body = route.request().postDataJSON() as {
      params?: { request_type?: string };
    };
    // #region agent log
    appendFileSync(
      '/opt/cursor/logs/debug.log',
      `${JSON.stringify({
        hypothesisId: 'B',
        location: 'notifications-auth.ts:73',
        message: 'NEAR RPC interception observed',
        data: { requestType: body.params?.request_type ?? null },
        timestamp: Date.now(),
      })}\n`
    );
    // #endregion
    if (body.params?.request_type !== 'view_access_key') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'onsocial-bff',
        result: {
          permission: {
            FunctionCall: {
              receiver_id: CORE_TESTNET,
              method_names: ['execute'],
              allowance: '250000000000000000000000',
            },
          },
        },
      }),
    });
  });

  await page.addInitScript(
    ([walletKey, authKey, sessionKeyPrefix, id, idSuffix, session, jwt]) => {
      window.localStorage.setItem(walletKey, id);
      window.localStorage.setItem(authKey, '1');
      window.localStorage.setItem(
        `${sessionKeyPrefix}${idSuffix}`,
        JSON.stringify(session)
      );
      window.sessionStorage.setItem(
        `onsocial.app.gateway.jwt.${id.toLowerCase()}`,
        jwt
      );
    },
    [
      E2E_WALLET_ACCOUNT_KEY,
      E2E_AUTH_SESSION_KEY,
      SESSION_PREFIX,
      NOTIFICATIONS_E2E_ACCOUNT,
      storageId,
      storedSession,
      token,
    ] as const
  );
}
