import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { seedAuthenticatedNotifications } from './helpers/notifications-auth';

/**
 * Person location is entered in the same Location drawer as an organisation.
 * The edit line is a button; the Based-in field only exists after it opens.
 */

async function stubProfileEditor(
  page: Page,
  kind: 'person' | 'org'
): Promise<void> {
  await page.route('**/api/profile/editor**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accountId: 'alice.testnet',
        hasProfile: true,
        name: kind === 'org' ? 'Atelier' : 'Alice',
        location: '',
        industry: '',
        kind,
        bio: '',
        about: '',
        lead: '',
        aboutAlign: 'left',
        avatarUrl: null,
        bannerUrl: null,
        bannerMedia: null,
        links: {},
        pageConfig: {},
        tags: [],
        photos: [],
      }),
    });
  });
}

async function openEditor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAuthenticatedNotifications(page);
  await gotoApp(page, '/');
  await dismissNextDevOverlay(page);
  await page.getByRole('button', { name: /^You, @/ }).click();
  const accountRow = page.getByRole('button', {
    name: /Account[\s\S]*Profile, alerts, log out/,
  });
  await expect(accountRow).toBeVisible({ timeout: 15_000 });
  await accountRow.click();
  const accountMenu = page.getByRole('dialog', { name: 'Account' });
  await expect(accountMenu).toBeVisible({ timeout: 15_000 });
  await accountMenu.getByRole('button', { name: /Edit profile/ }).click();
  await expect(page.getByRole('dialog', { name: 'Edit profile' })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('profile location drawer', () => {
  test('a person opens Based in in a drawer, then the line shows the place', async ({
    page,
  }) => {
    await stubProfileEditor(page, 'person');
    await openEditor(page);
    const editor = page.getByRole('dialog', { name: 'Edit profile' });
    const location = editor.getByRole('button', { name: 'Location, Based in' });
    await expect(location).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Based in' })).toHaveCount(
      0
    );

    await location.click();
    const drawer = page.getByRole('dialog', { name: 'Location' });
    await expect(drawer).toBeVisible();
    const field = drawer.getByRole('textbox', { name: 'Based in' });
    await expect(drawer).toHaveClass(/is-open/);
    await drawer.evaluate((panel) =>
      Promise.all(panel.getAnimations().map((animation) => animation.finished))
    );
    await field.fill('Lisbon');
    await expect(drawer.getByRole('button', { name: 'Done' })).toBeInViewport();
    await page.screenshot({
      path: '/opt/cursor/artifacts/person-location-drawer.png',
    });
    await field.press('Enter');

    await expect(drawer).toBeHidden();
    await expect(
      editor.getByRole('button', { name: 'Location, Lisbon' })
    ).toBeVisible();
    await page.screenshot({
      path: '/opt/cursor/artifacts/person-location-committed.png',
    });
  });

  test('an organisation still opens location in the same drawer', async ({
    page,
  }) => {
    await stubProfileEditor(page, 'org');
    await openEditor(page);
    const editor = page.getByRole('dialog', { name: 'Edit profile' });
    await editor.getByRole('button', { name: 'Location, Location' }).click();
    const drawer = page.getByRole('dialog', { name: 'Location' });
    const field = drawer.getByRole('textbox', { name: 'Based in' });
    await expect(drawer).toHaveClass(/is-open/);
    await drawer.evaluate((panel) =>
      Promise.all(panel.getAnimations().map((animation) => animation.finished))
    );
    await expect(field).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Done' })).toBeInViewport();
    await page.screenshot({
      path: '/opt/cursor/artifacts/org-location-drawer.png',
    });
    await field.press('Enter');
    await expect(drawer).toBeHidden();
  });
});
