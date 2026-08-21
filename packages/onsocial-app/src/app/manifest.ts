import type { MetadataRoute } from 'next';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

export default function manifest(): MetadataRoute.Manifest {
  const isMainnet = ACTIVE_NEAR_NETWORK === 'mainnet';

  return {
    name: isMainnet ? 'OnSocial' : 'OnSocial Testnet',
    // Keep short for home-screen labels (≈12 chars).
    short_name: 'OnSocial',
    description: 'A page for every account.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#000000',
    // Status bar / browser chrome — soft surface ink, not portal blue.
    theme_color: '#0c0d10',
    categories: ['social', 'entertainment'],
    icons: [
      {
        src: '/onsocial_icon_192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/onsocial_icon_512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/onsocial_icon_maskable_512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
