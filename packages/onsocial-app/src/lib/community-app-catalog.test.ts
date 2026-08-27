import { describe, expect, it } from 'vitest';
import { fetchCommunityAppCatalog } from '@/lib/community-app-catalog';

describe('community app catalog', () => {
  it('drops non-https listings from a catalog response', async () => {
    const fetchMock = async () =>
      ({
        ok: true,
        json: async () => ({
          apps: [
            {
              appId: 'ok',
              name: 'Ok',
              iconUrl: null,
              href: 'https://ok.example',
            },
            {
              appId: 'bad',
              name: 'Bad',
              iconUrl: null,
              href: 'http://bad.example',
            },
          ],
        }),
      }) as Response;
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const apps = await fetchCommunityAppCatalog();
      expect(apps.map((app) => app.appId)).toEqual(['ok']);
    } finally {
      globalThis.fetch = original;
    }
  });
});
