import type { MetadataRoute } from 'next';
import { PORTAL_ORIGIN } from '@/lib/portal-origin';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/ops', '/offline', '/token'],
    },
    sitemap: `${PORTAL_ORIGIN}/sitemap.xml`,
  };
}
