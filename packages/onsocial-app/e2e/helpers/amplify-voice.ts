import type { Page } from '@playwright/test';

export const AMPLIFY_E2E_AUTHOR = 'alice.testnet';
export const AMPLIFY_E2E_POST_ID = 'hello';

const STUB_POST = {
  accountId: AMPLIFY_E2E_AUTHOR,
  postId: AMPLIFY_E2E_POST_ID,
  value: JSON.stringify({ text: 'Hello from Alice.' }),
  blockHeight: 1,
  blockTimestamp: Date.now(),
  receiptId: 'amplify-e2e',
  isGroupContent: false,
};

/** Intercept GraphQL so a personal post can open Amplify without a live API key. */
export async function stubAmplifyPostGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (query.includes('postsCurrent')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { postsCurrent: [STUB_POST] } }),
      });
      return;
    }

    if (query.includes('quotes(') || query.includes('query Quotes')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { quotes: [] } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}
