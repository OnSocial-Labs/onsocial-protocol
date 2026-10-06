import type { MetadataRoute } from 'next';
import { PORTAL_ORIGIN } from '@/lib/portal-origin';
import { SDK_METHOD_GUIDES } from '@/data/sdk-method-guides';

const STATIC_ROUTES = [
  '',
  '/about',
  '/boost/leaderboard',
  '/governance',
  '/governance/policy',
  '/onapi',
  '/onapi/apps',
  '/partners',
  '/playground',
  '/sdk',
  '/season',
  '/season-zero',
  '/swap',
  '/transparency',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    ...STATIC_ROUTES,
    ...SDK_METHOD_GUIDES.map((guide) => `/sdk/${guide.slug}`),
  ];
  return routes.map((route) => ({
    url: `${PORTAL_ORIGIN}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : route === '/sdk' ? 0.9 : 0.7,
  }));
}
