import type { MetadataRoute } from 'next';
import { ACTIVE_NEAR_NETWORK } from '@/lib/near-network';

export default function manifest(): MetadataRoute.Manifest {
  const isMainnet = ACTIVE_NEAR_NETWORK === 'mainnet';
  const name = isMainnet ? 'OnSocial Portal' : 'OnSocial Portal Testnet';

  return {
    name,
    short_name: isMainnet ? 'OnSocial' : 'OnSocial Testnet',
    description:
      'Build the future of social with OnSocial Protocol. A powerful, scalable decentralized social protocol on NEAR blockchain.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    background_color: '#050816',
    theme_color: '#07111f',
    categories: ['social', 'finance', 'productivity'],
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
    shortcuts: [
      {
        name: 'Transparency',
        short_name: 'Transparency',
        url: '/transparency',
        icons: [{ src: '/onsocial_icon_192.png', sizes: '192x192' }],
      },
      {
        name: 'Governance',
        short_name: 'Governance',
        url: '/governance',
        icons: [{ src: '/onsocial_icon_192.png', sizes: '192x192' }],
      },
      {
        name: 'Boost',
        short_name: 'Boost',
        url: '/boost',
        icons: [{ src: '/onsocial_icon_192.png', sizes: '192x192' }],
      },
    ],
  } as ReturnType<typeof manifest>;
}
