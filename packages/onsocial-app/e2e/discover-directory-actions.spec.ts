import { expect, test, type Locator, type Page } from '@playwright/test';
import { clickTab, gotoApp } from './helpers';

const STUDIO = 'studio.near';
const QUIET = 'quiet.near';
const CLINIC = 'clinic.near';

function profile(input: {
  accountId: string;
  name: string;
  kind: 'person' | 'org';
  offerCount: number;
  openJobsCount: number;
  faceLine: string | null;
}) {
  return {
    accountId: input.accountId,
    name: input.name,
    bio: 'Bio that the directory line replaces.',
    avatarUrl: null,
    kind: input.kind,
    industry: null,
    offerCount: input.offerCount,
    openJobsCount: input.openJobsCount,
    faceLine: input.faceLine,
    standingCount: 3,
    standingWithCount: 1,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    moodId: 'protocol',
    viewerStanding: false,
    theyStandWithViewer: false,
    targetEndorsedViewer: false,
    viewerEndorsed: false,
  };
}

function discoverPage(face: string) {
  const offers = [
    profile({
      accountId: STUDIO,
      name: 'Studio',
      kind: 'org',
      offerCount: 2,
      openJobsCount: 1,
      faceLine: 'Brand identity · 2',
    }),
    profile({
      accountId: QUIET,
      name: 'Quiet',
      kind: 'person',
      offerCount: 1,
      openJobsCount: 0,
      faceLine: 'Portrait session',
    }),
  ];
  const hiring = [
    profile({
      accountId: STUDIO,
      name: 'Studio',
      kind: 'org',
      offerCount: 2,
      openJobsCount: 1,
      faceLine: 'Designer',
    }),
    profile({
      accountId: CLINIC,
      name: 'Clinic',
      kind: 'org',
      offerCount: 0,
      openJobsCount: 1,
      faceLine: 'Nurse',
    }),
  ];
  const people = [
    profile({
      accountId: QUIET,
      name: 'Quiet',
      kind: 'person',
      offerCount: 3,
      openJobsCount: 2,
      faceLine: null,
    }),
  ];
  const profiles =
    face === 'hiring' ? hiring : face === 'people' ? people : offers;
  return {
    query: '',
    face: face === 'hiring' || face === 'people' ? face : 'offers',
    industry: '',
    craft: '',
    limit: 24,
    offset: 0,
    hasMore: false,
    profiles,
  };
}

async function sheetInViewport(page: Page, sheet: Locator): Promise<boolean> {
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) return false;
  return box.y >= 0 && box.y + box.height <= viewport.height + 1;
}

async function stubDirectory(page: Page) {
  await page.route('**/api/discover**', async (route) => {
    const face = new URL(route.request().url()).searchParams.get('face');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(discoverPage(face ?? 'offers')),
    });
  });
  await page.route('**/api/offers**', async (route) => {
    const url = new URL(route.request().url());
    const accountId = url.searchParams.get('accountId');
    const offers =
      accountId === STUDIO
        ? [
            {
              offerId: 'brand',
              title: 'Brand identity',
              description: 'A full identity system.',
              url: 'https://studio.example/brand',
              since: 1_700_000_000_000,
            },
            {
              offerId: 'site',
              title: 'Site build',
              description: null,
              url: null,
              since: 1_700_000_000_000,
            },
          ]
        : accountId === QUIET
          ? [
              {
                offerId: 'portrait',
                title: 'Portrait session',
                description: 'One sitting.',
                url: null,
                since: 1_700_000_000_000,
              },
            ]
          : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ offers, counts: {} }),
    });
  });
  await page.route('**/api/jobs**', async (route) => {
    const accountId = new URL(route.request().url()).searchParams.get(
      'accountId'
    );
    const jobs =
      accountId === STUDIO || accountId === CLINIC
        ? [
            {
              orgAccountId: accountId,
              jobId: accountId === CLINIC ? 'nurse' : 'designer',
              title: accountId === CLINIC ? 'Nurse' : 'Designer',
              description: 'Open role.',
              url: 'https://example.com/apply',
              ends: Date.now() + 86_400_000 * 30,
              since: 1_700_000_000_000,
              orgName: accountId === CLINIC ? 'Clinic' : 'Studio',
              orgKind: 'org',
              orgIndustry: null,
              orgAvatar: null,
              blockHeight: 1,
              blockTimestamp: 1_700_000_000_000,
            },
          ]
        : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobs }),
    });
  });
}

test.describe('discover directory actions', () => {
  test('See offers and See hiring open the profile drawers', async ({
    page,
  }) => {
    await stubDirectory(page);
    await gotoApp(page, '/discover?tab=profiles&face=offers');

    await expect(
      page.getByRole('button', { name: 'See offers from Studio' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'See hiring at Studio' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'See offers from Quiet' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'See hiring at Quiet' })
    ).toHaveCount(0);

    await expect(
      page.getByRole('link', { name: "View Studio's profile" })
    ).toHaveAttribute('href', `/@${STUDIO}`);

    await page.getByRole('button', { name: 'See offers from Studio' }).click();
    const offersSheet = page.getByRole('dialog', { name: 'Offers' });
    await expect(offersSheet).toBeVisible();
    await expect
      .poll(async () => sheetInViewport(page, offersSheet))
      .toBe(true);
    await expect(offersSheet.getByText('Brand identity')).toBeVisible();
    await expect(offersSheet.getByText('Site build')).toBeVisible();
    await expect(page).toHaveURL(/\/discover\?/);
    await offersSheet.getByRole('button', { name: 'Close offers' }).click();
    await expect(offersSheet).toBeHidden();

    await page.getByRole('button', { name: 'See offers from Quiet' }).click();
    const portrait = page.getByRole('dialog', { name: 'Portrait session' });
    await expect(portrait).toBeVisible();
    await portrait.getByRole('button', { name: 'Close offer' }).click();
    await expect(portrait).toBeHidden();

    await page.getByRole('button', { name: 'See hiring at Studio' }).click();
    const hiringSheet = page.getByRole('dialog', { name: 'Hiring' });
    await expect(hiringSheet).toBeVisible();
    await expect(hiringSheet.getByText('Designer')).toBeVisible();
    await expect
      .poll(async () => sheetInViewport(page, hiringSheet))
      .toBe(true);
    await expect(page).toHaveURL(/face=offers/);
    await hiringSheet.getByRole('button', { name: 'Close hiring' }).click();
    await expect(hiringSheet).toBeHidden();

    await clickTab(page, 'Filter profiles', 'Hiring');
    await expect(
      page.getByRole('button', { name: 'See hiring at Clinic' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'See offers from Clinic' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'See offers from Studio' })
    ).toBeVisible();

    await clickTab(page, 'Filter profiles', 'People');
    await expect(
      page.getByRole('link', { name: "View Quiet's profile" })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /See offers/ })).toHaveCount(
      0
    );
    await expect(page.getByRole('button', { name: /See hiring/ })).toHaveCount(
      0
    );
  });
});
