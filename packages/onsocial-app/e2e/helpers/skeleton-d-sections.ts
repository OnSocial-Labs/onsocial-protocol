import { expect, type Page } from '@playwright/test';
import { E2E_VAULT_OWNER } from '../../src/lib/e2e-graph-stubs';
import { seedE2eWallet } from './collection-page';
import { setE2eGraphMarket, setE2eGraphVault } from './e2e-graph';

/** Signed-in vault plus the live-first catalog, which includes one sale. */
export async function openSignedInMarket(page: Page): Promise<void> {
  await seedE2eWallet(page, E2E_VAULT_OWNER);
  await setE2eGraphMarket(page, 'live-first');
  await setE2eGraphVault(page, 'default');
}

export async function sectionGapPx(
  page: Page,
  firstSelector: string,
  secondSelector: string
): Promise<{ distance: number; expected: number }> {
  const measured = await page.evaluate(
    ({ firstSelector, secondSelector }) => {
      const first = document.querySelector(firstSelector);
      const second = document.querySelector(secondSelector);
      if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
        return null;
      }
      const column = first.closest('.market-page, .drops-page-body');
      if (!(column instanceof HTMLElement)) return null;
      const root = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize
      );
      return {
        distance:
          second.getBoundingClientRect().top -
          first.getBoundingClientRect().bottom,
        expected: 1.35 * root,
        parentGap: getComputedStyle(first.parentElement!).gap,
        columnGap: getComputedStyle(column).gap,
      };
    },
    { firstSelector, secondSelector }
  );
  expect(measured).toBeTruthy();
  expect(measured!.parentGap).toBe(measured!.columnGap);
  expect(Math.abs(measured!.distance - measured!.expected)).toBeLessThan(0.6);
  return { distance: measured!.distance, expected: measured!.expected };
}
