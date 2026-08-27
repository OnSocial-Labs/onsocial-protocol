export type CommunityAppListing = {
  appId: string;
  name: string;
  iconUrl: string | null;
  href: string;
};

export async function fetchCommunityAppCatalog(): Promise<
  CommunityAppListing[]
> {
  const response = await fetch('/api/onapi/developer/apps/catalog', {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { apps?: CommunityAppListing[] };
  if (!Array.isArray(body.apps)) return [];
  return body.apps.filter(
    (app) =>
      typeof app.appId === 'string' &&
      typeof app.name === 'string' &&
      typeof app.href === 'string' &&
      app.href.startsWith('https://')
  );
}
