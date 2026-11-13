import { expect, test, type Page } from '@playwright/test';
import {
  E2E_FIRST_CONNECT_ACCOUNT_KEY,
  E2E_FIRST_CONNECT_KEY,
  E2E_MOCK_SIGNER_KEY,
} from '../src/lib/e2e-mock-signer';
import { E2E_WALLET_ACCOUNT_KEY } from '../src/lib/e2e-wallet-account';
import { APP_WALLET_ACCOUNT_KEY } from '../src/lib/gate-return';
import { dismissNextDevOverlay, gotoApp } from './helpers';

const ACCOUNT = 'alice.testnet';
const FUNDED = '13000000000000000000000';
const CORE = 'core.onsocial.testnet';

async function seedFirstConnect(page: Page): Promise<void> {
  await page.addInitScript(
    ([firstKey, accountKey, signerKey, walletKey, storedKey, account]) => {
      window.localStorage.setItem(firstKey, '1');
      window.localStorage.setItem(accountKey, account);
      window.localStorage.setItem(signerKey, '1');
      window.localStorage.removeItem(walletKey);
      window.localStorage.removeItem(storedKey);
      document.cookie = 'onsocial_e2e_key=; path=/; max-age=0';
    },
    [
      E2E_FIRST_CONNECT_KEY,
      E2E_FIRST_CONNECT_ACCOUNT_KEY,
      E2E_MOCK_SIGNER_KEY,
      E2E_WALLET_ACCOUNT_KEY,
      APP_WALLET_ACCOUNT_KEY,
      ACCOUNT,
    ] as const
  );
}

async function stubBalance(page: Page, funded: boolean): Promise<void> {
  let dripped = false;
  await page.route('**/api/onboarding/welcome-near', async (route) => {
    dripped = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        dripped: true,
        enabled: true,
      }),
    });
  });
  await page.route('**/api/near/rpc', async (route) => {
    const body = route.request().postDataJSON() as {
      params?: { request_type?: string };
    };
    const requestType = body?.params?.request_type;
    const keyAdded = (route.request().headers().cookie ?? '').includes(
      'onsocial_e2e_key=1'
    );
    if (requestType === 'view_account') {
      const amount = funded || dripped ? FUNDED : '1';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'e2e',
          result: { amount, locked: '0' },
        }),
      });
      return;
    }
    if (requestType === 'view_access_key' && keyAdded) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'e2e',
          result: {
            permission: {
              FunctionCall: {
                receiver_id: CORE,
                method_names: ['execute'],
                allowance: '8000000000000000000000',
              },
            },
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'e2e',
        result: {},
      }),
    });
  });
}

function signInSheet(page: Page) {
  return page.getByRole('dialog', { name: 'Sign in' });
}

test.describe('first connect session key', () => {
  test('a funded first visit approves sign-in once, with app access', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedFirstConnect(page);
    await stubBalance(page, true);
    await gotoApp(page, '/');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Let’s connect' }).click();

    const sheet = signInSheet(page);
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toHaveAttribute('data-app-access', 'yes');
    await sheet.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/You're set/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(sheet).toHaveCount(0);
  });

  test('an unfunded first visit signs in, then approves app access', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedFirstConnect(page);
    await stubBalance(page, false);
    await gotoApp(page, '/');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Let’s connect' }).click();

    const sheet = signInSheet(page);
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toHaveAttribute('data-app-access', 'no');
    await sheet.getByRole('button', { name: 'Approve' }).click();

    await expect(sheet).toHaveCount(1, { timeout: 15_000 });
    await expect(sheet).toHaveAttribute('data-app-access', 'yes');
  });
});
