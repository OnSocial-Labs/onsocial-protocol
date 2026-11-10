import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  dismissNextDevOverlay,
  gotoApp,
} from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import { COLLECTIBLES_VAULT_OWNER } from './helpers/collectibles-vault';
import {
  encodeDmPublicKey,
  encodeDmSecretKey,
  generateDmKeyPair,
} from '../src/lib/dm/crypto';
import {
  openEndorseComposeLoggedOut,
  stubEndorseComposeApis,
} from './helpers/endorse-compose-voice';
import { setE2eGraphHub } from './helpers/e2e-graph';
import { HUB_E2E_PATH, stubHubPage } from './helpers/hub-page';

/** EMULATED touch. Not a physical device. */
async function emulatedTouch(
  page: Page,
  start: { x: number; y: number },
  moves: Array<{ x: number; y: number }>,
  holdMs = 0
) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: start.x, y: start.y, id: 1 }],
    });
    if (holdMs > 0) await page.waitForTimeout(holdMs);
    for (const move of moves) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: move.x, y: move.y, id: 1 }],
      });
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await client.detach();
  }
}

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  };
}

async function translateY(panel: Locator) {
  return panel.evaluate((el) => {
    const value = getComputedStyle(el).transform;
    if (!value || value === 'none') return 0;
    const match = value.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (!match?.[1]) return 0;
    const parts = match[1].split(',').map((part) => Number(part.trim()));
    return parts.length === 16 ? (parts[13] ?? 0) : (parts[5] ?? 0);
  });
}

async function expectChevronConcealed(locator: Locator) {
  const style = await locator.evaluate((el) => {
    const computed = getComputedStyle(el);
    return {
      opacity: computed.opacity,
      pointerEvents: computed.pointerEvents,
    };
  });
  expect(style.opacity).toBe('0');
  expect(style.pointerEvents).toBe('none');
}

async function mouseDrag(page: Page, locator: Locator, dy: number) {
  const start = await centerOf(locator);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + dy, { steps: 12 });
  await page.mouse.up();
}

test.describe('drawer pull gestures', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keyboard opens portfolio page content', async ({ page }) => {
    await gotoApp(page, '/@alice.testnet');
    await dismissNextDevOverlay(page);
    const entry = page.getByRole('button', { name: 'Open page', exact: true });
    await expect(entry).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    const box = await entry.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(52);
    expect(Math.round(box!.height)).toBe(52);

    for (let step = 0; step < 40; step += 1) {
      if (await entry.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(entry).toBeFocused();
    await expect
      .poll(async () => entry.evaluate((el) => getComputedStyle(el).boxShadow))
      .toMatch(/0px 2px/);
    const ring = await entry.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).toMatch(/0px 4px/);
    await expect(entry).toHaveRole('button');
    await expect(entry).toHaveAccessibleName('Open page');
    await expect(entry).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(entry).toHaveAttribute('aria-expanded', 'false');
    const tree = await page.locator('.portfolio-summon-dock').ariaSnapshot();
    expect(tree).toContain('Open page');

    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('dialog', { name: 'OnSocial launcher' })
    ).toHaveCount(0);
    const chevron = page.locator('.portfolio-page-chevron');
    await expect(chevron).toHaveAttribute('aria-expanded', 'true');
    await expect(chevron).toHaveAttribute('aria-hidden', 'true');
    await expect(chevron).toHaveAttribute('tabindex', '-1');
    await expectChevronConcealed(chevron);
    await expect(
      page.getByRole('button', { name: 'Open page', exact: true })
    ).toHaveCount(0);
    const drawer = page.getByRole('dialog', { name: / page$/ });
    const close = drawer.getByRole('button', { name: 'Close page' });
    await expect(close).toBeVisible();
    const name = drawer.locator('.page-drawer-name');
    await expect(name).toBeVisible();
    const selectable = await name.evaluate(
      (el) => getComputedStyle(el).userSelect
    );
    expect(selectable).not.toBe('none');
    await name.click({ clickCount: 3 });
    const selected = await page.evaluate(
      () => window.getSelection()?.toString() ?? ''
    );
    expect(selected.trim().length).toBeGreaterThan(0);
    await expect(close).toBeVisible();

    const grip = drawer.locator('.glass-sheet-drag');
    await mouseDrag(page, grip, 280);
    await expect(drawer).toBeVisible();

    const touchStart = await centerOf(grip);
    await emulatedTouch(page, touchStart, [
      { x: touchStart.x, y: touchStart.y + 80 },
      { x: touchStart.x, y: touchStart.y + 220 },
    ]);
    await expect(drawer).toBeHidden();
    await expect(entry).toBeFocused();
  });

  test('space opens the page and escape returns focus', async ({ page }) => {
    await gotoApp(page, '/@alice.testnet');
    await dismissNextDevOverlay(page);
    const entry = page.getByRole('button', { name: 'Open page', exact: true });
    await entry.waitFor({ state: 'visible' });
    for (let step = 0; step < 40; step += 1) {
      if (await entry.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Space');
    await expect(page.locator('.page-drawer-panel')).toBeVisible();
    await expectChevronConcealed(page.locator('.portfolio-page-chevron'));
    await page.keyboard.press('Escape');
    await expect(page.locator('.page-drawer-panel')).toHaveCount(0);
    await expect(entry).toBeFocused();
  });

  test('a tucked chevron reveals on focus', async ({ page }) => {
    await gotoApp(page, '/@alice.testnet');
    await dismissNextDevOverlay(page);
    await page.evaluate(() => {
      const scroller = document.querySelector('.portfolio-page');
      if (!(scroller instanceof HTMLElement)) return;
      scroller.style.overflowY = 'auto';
      const filler = document.createElement('div');
      filler.setAttribute('data-test-scroll-room', '');
      filler.style.height = '2000px';
      filler.style.minHeight = '2000px';
      filler.style.flexShrink = '0';
      scroller.appendChild(filler);
      const fire = (top: number) => {
        scroller.scrollTop = top;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      };
      fire(80);
      fire(240);
    });
    const dock = page.locator('.portfolio-summon-dock');
    await expect(dock).toHaveClass(/is-scroll-hidden/);
    const entry = page.getByRole('button', { name: 'Open page', exact: true });
    for (let step = 0; step < 50; step += 1) {
      if (await entry.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(entry).toBeFocused();
    await expect(dock).toHaveClass(/is-scroll-hidden/);
    await expect
      .poll(async () =>
        dock.evaluate((el) => {
          const style = getComputedStyle(el);
          const y = new DOMMatrixReadOnly(style.transform).m42;
          return (
            style.opacity === '1' &&
            style.pointerEvents === 'auto' &&
            Math.abs(y) < 1
          );
        })
      )
      .toBe(true);
    await expect
      .poll(async () => entry.evaluate((el) => getComputedStyle(el).boxShadow))
      .toMatch(/0px 4px/);
    const motion = await entry.evaluate(
      (el) => getComputedStyle(el).transitionDuration
    );
    await page.keyboard.press('Enter');
    await expect(page.locator('.page-drawer-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.page-drawer-panel')).toHaveCount(0);
    await expect(entry).toBeFocused();
    expect(motion).toBeTruthy();
  });

  test('reduced motion keeps the chevron still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page, '/@alice.testnet');
    await dismissNextDevOverlay(page);
    const entry = page.getByRole('button', { name: 'Open page', exact: true });
    await entry.waitFor();
    const motion = await entry.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.transitionDuration} ${style.animationName}`;
    });
    expect(motion.startsWith('0s')).toBe(true);
    expect(motion).not.toContain('portfolio-summon-hint-in');
  });

  test('the chevron stays hidden while writing', async ({ page }) => {
    await gotoApp(page, '/@alice.testnet');
    await dismissNextDevOverlay(page);
    const entry = page.getByRole('button', { name: 'Open page', exact: true });
    await entry.waitFor();
    await page.locator('.portfolio-summon-dock').evaluate((el) => {
      el.classList.add('is-writing');
    });
    await expectChevronConcealed(entry);
  });

  test('launcher ignores a mouse drag and still closes from an emulated touch pull', async ({
    page,
  }) => {
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Open launcher' }).click();
    const launcher = page.getByRole('dialog', { name: 'OnSocial launcher' });
    await expect(launcher).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    const grip = launcher.getByRole('button', { name: 'Drag down to close' });
    await mouseDrag(page, grip, 280);
    await expect(launcher).toBeVisible();
    const touchStart = await centerOf(grip);
    await emulatedTouch(page, touchStart, [
      { x: touchStart.x, y: touchStart.y + 80 },
      { x: touchStart.x, y: touchStart.y + 260 },
    ]);
    await expect(launcher).toBeHidden();
  });

  test('slow and shaky taps still fire, and a refused endorse close snaps back', async ({
    page,
  }) => {
    await stubEndorseComposeApis(page);
    await openEndorseComposeLoggedOut(page);
    const sheet = page.getByRole('dialog', { name: /^Endorse / });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    const design = sheet.getByRole('button', { name: 'Design', exact: true });
    await design.scrollIntoViewIfNeeded();
    const designPoint = await centerOf(design);
    await emulatedTouch(page, designPoint, [], 700);
    await expect(design).toHaveAttribute('aria-pressed', 'true');

    const product = sheet.getByRole('button', { name: 'Product', exact: true });
    await product.scrollIntoViewIfNeeded();
    const productPoint = await centerOf(product);
    await emulatedTouch(page, productPoint, [
      { x: productPoint.x + 4, y: productPoint.y + 4 },
    ]);
    await expect(product).toHaveAttribute('aria-pressed', 'true');

    const governance = sheet.getByRole('button', {
      name: 'Governance',
      exact: true,
    });
    await governance.scrollIntoViewIfNeeded();
    const governancePoint = await centerOf(governance);
    await emulatedTouch(page, governancePoint, [
      { x: governancePoint.x, y: governancePoint.y + 16 },
      { x: governancePoint.x, y: governancePoint.y + 48 },
    ]);
    await expect(governance).toHaveAttribute('aria-pressed', 'false');
    await governance.click();
    await expect(governance).toHaveAttribute('aria-pressed', 'true');

    const grip = sheet.locator('.glass-sheet-drag');
    await mouseDrag(page, grip, 240);
    await expect(sheet).toBeVisible();
    expect(Math.abs(await translateY(sheet))).toBeLessThan(8);

    const pull = await centerOf(grip);
    await emulatedTouch(page, pull, [
      { x: pull.x, y: pull.y + 80 },
      { x: pull.x, y: pull.y + 240 },
    ]);
    await expect(sheet).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Discard endorsement?' })
    ).toBeVisible();
    await expect
      .poll(async () => Math.abs(await translateY(sheet)))
      .toBeLessThan(8);
  });

  test('a refused message close snaps back', async ({ page }) => {
    const viewer = COLLECTIBLES_VAULT_OWNER;
    const pair = generateDmKeyPair();
    const identity = {
      accountId: viewer,
      publicKey: encodeDmPublicKey(pair.publicKey),
      secretKey: encodeDmSecretKey(pair.secretKey),
      createdAt: new Date().toISOString(),
      recoveryCodeShownAt: new Date().toISOString(),
    };
    await page.addInitScript((record) => {
      window.localStorage.setItem(
        `onsocial.app.dm.${record.accountId.toLowerCase()}`,
        JSON.stringify(record)
      );
    }, identity);
    await seedE2eWallet(page, viewer);
    await gotoApp(page, '/@alice.testnet');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: /^Message / }).click();
    const sheet = page.getByRole('dialog', { name: /^Message / });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await sheet.getByPlaceholder('Message').fill('hello from the drawer');
    const grip = sheet.locator('.glass-sheet-drag');
    const pull = await centerOf(grip);
    await emulatedTouch(page, pull, [
      { x: pull.x, y: pull.y + 80 },
      { x: pull.x, y: pull.y + 240 },
    ]);
    await expect(sheet).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Discard message?' })
    ).toBeVisible();
    await expect
      .poll(async () => Math.abs(await translateY(sheet)))
      .toBeLessThan(8);
    await page
      .getByRole('dialog', { name: 'Discard message?' })
      .locator('.os-sheet-action--primary')
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Discard message?' })
    ).toBeHidden();
    await expect(sheet.getByPlaceholder('Message')).toHaveValue(
      'hello from the drawer'
    );
  });

  test('hub transfer ignores a mouse drag and still closes when close is allowed', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await setE2eGraphHub(page, 'staff');
    await stubHubPage(page, {
      rows: 'catalog',
      ownerId: COLLECTIBLES_VAULT_OWNER,
    });
    await gotoApp(page, HUB_E2E_PATH);
    await page
      .locator('.app-page-hero')
      .getByRole('button', { name: 'Hub settings' })
      .click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await settings.getByRole('button', { name: 'Transfer hub' }).click();
    const transfer = page.getByRole('dialog', { name: 'Transfer hub' });
    await expect(transfer).toBeVisible();
    const grip = transfer.locator('.glass-sheet-drag');
    await mouseDrag(page, grip, 240);
    await expect(transfer).toBeVisible();
    const pull = await centerOf(grip);
    await emulatedTouch(page, pull, [
      { x: pull.x, y: pull.y + 80 },
      { x: pull.x, y: pull.y + 260 },
    ]);
    await expect(transfer).toBeHidden();
  });
});

test.describe('sheet body pulls', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a touch pull on the page drawer body closes it from the top', async ({
    page,
  }) => {
    await gotoApp(page, '/@alice.testnet');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Open page', exact: true }).click();
    const panel = page.locator('.page-drawer-panel');
    await expect(panel).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect
      .poll(async () => (await panel.boundingBox())?.y ?? 9999)
      .toBeLessThan(20);
    const body = page.locator('.page-drawer-body');
    await body.evaluate((el) => {
      el.scrollTop = 0;
    });
    const start = await body.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + 36 };
    });
    await emulatedTouch(page, start, [
      { x: start.x, y: start.y + 36 },
      { x: start.x, y: start.y + 260 },
    ]);
    await expect(page.locator('.page-drawer-panel')).toHaveCount(0);
  });

  test('a touch pull on the launcher body closes it from the top', async ({
    page,
  }) => {
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Open launcher' }).click();
    const launcher = page.getByRole('dialog', { name: 'OnSocial launcher' });
    await expect(launcher).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(launcher).not.toHaveClass(/is-enter/);
    const grip = launcher.getByRole('button', { name: 'Drag down to close' });
    const gripBox = await grip.boundingBox();
    if (!gripBox) throw new Error('launcher grip has no box');
    await launcher.evaluate((el) => {
      for (const node of el.querySelectorAll('*')) {
        if (node instanceof HTMLElement) node.scrollTop = 0;
      }
    });
    const start = {
      x: gripBox.x + gripBox.width / 2,
      y: gripBox.y + gripBox.height + 24,
    };
    await emulatedTouch(page, start, [
      { x: start.x, y: start.y + 36 },
      { x: start.x, y: start.y + 280 },
    ]);
    await expect(launcher).toBeHidden();
  });
});

test.describe('page chevron on a wide desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a mouse click opens the page and leaves the launcher closed', async ({
    page,
  }) => {
    await gotoApp(page, '/@alice.testnet');
    await dismissNextDevOverlay(page);
    const entry = page.getByRole('button', { name: 'Open page', exact: true });
    await entry.click();
    await expect(page.locator('.page-drawer-panel')).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'OnSocial launcher' })
    ).toHaveCount(0);
    await expectChevronConcealed(page.locator('.portfolio-page-chevron'));
    await page.keyboard.press('Escape');
    await expect(page.locator('.page-drawer-panel')).toHaveCount(0);
    await expect(entry).toBeFocused();
    const visible = await entry.boundingBox();
    expect(Math.round(visible!.width)).toBe(52);
    expect(Math.round(visible!.height)).toBe(52);
  });
});
