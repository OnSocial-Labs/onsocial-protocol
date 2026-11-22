import { expect, test, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';

/**
 * Hard loads keep one shell in the document. The route `loading.tsx`
 * boundary still streams that shell through one hidden `S:` node.
 * A second Suspense fallback used to leave two shells at once.
 */
type ShellStream = {
  dropCreateForm: number;
  summonDock: number;
  pageChevron: number;
};

declare global {
  interface Window {
    __onsocialHardLoadShell?: ShellStream;
  }
}

function installShellStreamObserver(): void {
  const state: ShellStream = {
    dropCreateForm: 0,
    summonDock: 0,
    pageChevron: 0,
  };
  window.__onsocialHardLoadShell = state;

  const sampleNow = () => {
    state.dropCreateForm = Math.max(
      state.dropCreateForm,
      document.querySelectorAll('.drop-create-form').length
    );
    state.summonDock = Math.max(
      state.summonDock,
      document.querySelectorAll('.portfolio-summon-dock').length
    );
    state.pageChevron = Math.max(
      state.pageChevron,
      document.querySelectorAll('.portfolio-page-chevron').length
    );
  };

  // Record the count that survives to the next frame. Replacing the
  // loading shell with the settled screen can touch both nodes in one
  // commit; two shells that stay up (the old inner Suspense) are still seen.
  let pending = false;
  const sample = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      sampleNow();
    });
  };

  const observer = new MutationObserver(sample);
  observer.observe(document, { childList: true, subtree: true });
  sample();
  document.addEventListener('DOMContentLoaded', sampleNow);
}

function openingTags(html: string): string[] {
  return html.match(/<[^/!][^>]*>/g) ?? [];
}

function classListHas(tag: string, className: string): boolean {
  const match = /\sclass="([^"]*)"/.exec(tag);
  if (!match) return false;
  return match[1].split(/\s+/).includes(className);
}

/** Busy create shell from `loading.tsx`, not the settled `<form>`. */
function countBusyDropShells(html: string): number {
  return openingTags(html).filter(
    (tag) =>
      classListHas(tag, 'drop-create-form') && tag.includes('aria-busy="true"')
  ).length;
}

/** Pending portfolio frame from `loading.tsx`, not the settled face. */
function countPortfolioPendingFrames(html: string): number {
  return openingTags(html).filter(
    (tag) =>
      classListHas(tag, 'portfolio-identity') &&
      tag.includes('aria-busy="true"')
  ).length;
}

async function readShellStream(page: Page): Promise<ShellStream> {
  return page.evaluate(() => {
    const state = window.__onsocialHardLoadShell;
    if (!state) {
      throw new Error('shell stream observer missing');
    }
    return state;
  });
}

test.describe('hard-load streamed shells', () => {
  test('hard load of /drops/create keeps one drop shell', async ({
    page,
    request,
  }) => {
    const response = await request.get('/drops/create');
    expect(response.ok()).toBe(true);
    expect(countBusyDropShells(await response.text())).toBe(1);

    await page.addInitScript(installShellStreamObserver);
    await gotoApp(page, '/drops/create');
    const stream = await readShellStream(page);
    expect(stream.dropCreateForm).toBe(1);

    const form = page.locator('form#drop-create-form');
    await expect(form).toHaveCount(1);
    await expect(form).toHaveAttribute('data-drop-create-ready', '', {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
  });

  test('hard load of /@alice.testnet keeps one portfolio shell', async ({
    page,
    request,
  }) => {
    const response = await request.get('/@alice.testnet');
    expect(response.ok()).toBe(true);
    expect(countPortfolioPendingFrames(await response.text())).toBe(1);

    await page.addInitScript(installShellStreamObserver);
    await gotoApp(page, '/@alice.testnet');
    const stream = await readShellStream(page);
    expect(stream.summonDock).toBe(1);
    expect(stream.pageChevron).toBe(1);
    await expect(page.locator('.portfolio-summon-dock')).toHaveCount(1);
    await expect(page.locator('.portfolio-page-chevron')).toHaveCount(1);
  });
});
