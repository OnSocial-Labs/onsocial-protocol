import type { AppView, CreatorAccess } from '@/features/scarces/apps-data';
import type { HubCategoryFilter } from '@/features/scarces/hub-categories';

export type AppsAccessFilter = 'all' | CreatorAccess;
export type AppsDirectorySort = 'recent' | 'fee-asc' | 'fee-desc' | 'name';

export const APPS_PAGE_SIZE = 24;

export const APPS_ACCESS_FILTERS: ReadonlyArray<{
  id: AppsAccessFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'approval', label: 'Approval' },
  { id: 'invite_only', label: 'Staff' },
];

export const APPS_SORT_OPTIONS: ReadonlyArray<{
  value: AppsDirectorySort;
  label: string;
}> = [
  { value: 'recent', label: 'Recent' },
  { value: 'fee-asc', label: 'Fee ↑' },
  { value: 'fee-desc', label: 'Fee ↓' },
  { value: 'name', label: 'Name' },
];

/**
 * CI / SDK integration noise that floods testnet directories.
 * Keep conservative — real stores should never match these shapes.
 */
export function isLikelyTestStore(app: {
  appId: string;
  title: string;
}): boolean {
  const id = app.appId.trim().toLowerCase();
  const title = app.title.trim().toLowerCase();
  if (!id) return true;
  if (title === 'integration-test' || title.includes('integration-test')) {
    return true;
  }
  if (
    id.startsWith('intapptest_') ||
    id.startsWith('smokeapptest_') ||
    id.includes('.intapptest_') ||
    id.includes('.smokeapptest_')
  ) {
    return true;
  }
  // SDK pattern: intapp${id}.${account}
  if (/^intapp[\d_a-z]+?\./i.test(app.appId)) return true;
  return false;
}

export function matchesAppQuery(
  app: Pick<AppView, 'appId' | 'ownerId' | 'title' | 'description'>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    app.appId.toLowerCase().includes(needle) ||
    app.ownerId.toLowerCase().includes(needle) ||
    app.title.toLowerCase().includes(needle) ||
    (app.description ?? '').toLowerCase().includes(needle)
  );
}

export function sortApps(
  apps: AppView[],
  sort: AppsDirectorySort
): AppView[] {
  const next = [...apps];
  switch (sort) {
    case 'fee-asc':
      return next.sort(
        (a, b) =>
          a.primarySaleBps - b.primarySaleBps ||
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      );
    case 'fee-desc':
      return next.sort(
        (a, b) =>
          b.primarySaleBps - a.primarySaleBps ||
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      );
    case 'name':
      return next.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      );
    case 'recent':
    default:
      return next.sort(
        (a, b) =>
          (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0) ||
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      );
  }
}

export function filterDirectoryApps(
  apps: AppView[],
  opts: {
    query?: string;
    access?: AppsAccessFilter;
    category?: HubCategoryFilter;
    hideTest?: boolean;
    sort?: AppsDirectorySort;
  } = {}
): AppView[] {
  const access = opts.access ?? 'all';
  const category = opts.category ?? 'all';
  const hideTest = opts.hideTest ?? true;
  const query = opts.query ?? '';
  let rows = apps.filter((app) => {
    if (hideTest && isLikelyTestStore(app)) return false;
    if (access !== 'all' && app.creatorAccess !== access) return false;
    if (category !== 'all' && app.category !== category) return false;
    return matchesAppQuery(app, query);
  });
  rows = sortApps(rows, opts.sort ?? 'recent');
  return rows;
}
