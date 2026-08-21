import type { MetadataRoute } from 'next';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

export default function manifest(): MetadataRoute.Manifest {
  const isMainnet = ACTIVE_NEAR_NETWORK === 'mainnet';

  return {
    name: isMainnet ? 'OnSocial' : 'OnSocial Testnet',
    short_name: isMainnet ? 'OnSocial' : 'OnSocial Testnet',
    description: 'A page for every account.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait-primary',
    background_color: '#000000',
    theme_color: '#000000',
    categories: ['social', 'entertainment'],
    icons: [
      {
        src: '/onsocial_icon_192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/onsocial_icon_512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/onsocial_icon_512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
