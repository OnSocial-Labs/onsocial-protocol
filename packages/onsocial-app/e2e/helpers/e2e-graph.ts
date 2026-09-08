import type { Page } from '@playwright/test';
import {
  E2E_GRAPH_COOKIE,
  parseE2eGraphCookie,
  serializeE2eGraphCookie,
  type E2eGraphCatalog,
  type E2eGraphCookieValue,
  type E2eGraphDrop,
  type E2eGraphGuild,
  type E2eGraphHub,
  type E2eGraphMarket,
  type E2eGraphVault,
} from '../../src/lib/e2e-graph-stubs';

function e2eCookieUrl(): string {
  return (
    process.env.PLAYWRIGHT_TEST_BASE_URL ??
    process.env.E2E_BASE_URL ??
    `http://${process.env.E2E_HOST ?? 'localhost'}:${process.env.E2E_PORT ?? 3099}`
  );
}

async function setE2eGraphCookie(
  page: Page,
  patch: E2eGraphCookieValue
): Promise<void> {
  const existing = (await page.context().cookies()).find(
    (cookie) => cookie.name === E2E_GRAPH_COOKIE
  );
  const next = { ...parseE2eGraphCookie(existing?.value), ...patch };
  const value = serializeE2eGraphCookie(next);
  if (!value) return;
  await page.context().addCookies([
    {
      name: E2E_GRAPH_COOKIE,
      value,
      url: e2eCookieUrl(),
    },
  ]);
}

/** Opt SSR + BFF into a catalog fixture. Omit for the SSR-miss skeleton test. */
export async function setE2eGraphCatalog(
  page: Page,
  catalog: E2eGraphCatalog
): Promise<void> {
  await setE2eGraphCookie(page, { catalog });
}

/** Opt SSR + BFF into a vault fixture. Omit for library-skeleton tests. */
export async function setE2eGraphVault(
  page: Page,
  vault: E2eGraphVault
): Promise<void> {
  await setE2eGraphCookie(page, { vault });
}

/** Opt SSR + BFF into a hub fixture. Omit for the SSR-miss skeleton test. */
export async function setE2eGraphHub(
  page: Page,
  hub: E2eGraphHub
): Promise<void> {
  await setE2eGraphCookie(page, { hub });
}

/** Opt SSR + BFF into a guild fixture. Omit for the SSR-miss skeleton test. */
export async function setE2eGraphGuild(
  page: Page,
  guild: E2eGraphGuild
): Promise<void> {
  await setE2eGraphCookie(page, { guild });
}

/** Opt SSR + BFF into a market fixture. Omit for the shop SSR-miss test. */
export async function setE2eGraphMarket(
  page: Page,
  market: E2eGraphMarket
): Promise<void> {
  await setE2eGraphCookie(page, { market });
}

/** Opt SSR + BFF into a drop fixture. Omit for the SSR-miss skeleton test. */
export async function setE2eGraphDrop(
  page: Page,
  drop: E2eGraphDrop
): Promise<void> {
  await setE2eGraphCookie(page, { drop });
}
