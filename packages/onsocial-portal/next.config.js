const path = require('path');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(path.resolve(__dirname, '../..'));

// Mirror of PUBLIC_APP_URL in src/lib/portal-config.ts (config runs before src).
const publicAppUrl = (
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
    ? 'https://onsocial.id'
    : 'https://testnet.onsocial.id')
).replace(/\/$/, '');

// Social surfaces live in the app; the portal keeps protocol routes only.
// 307 (not 308) while the split rolls out.
const socialAppRedirects = [
  {
    source: '/u/:accountId',
    destination: `${publicAppUrl}/@:accountId`,
  },
  {
    source: '/u/:accountId/network',
    destination: `${publicAppUrl}/@:accountId/network`,
  },
  {
    source: '/u/:accountId/endorsements',
    destination: `${publicAppUrl}/@:accountId/endorsements`,
  },
  {
    source: '/u/:accountId/endorsements/supporters',
    destination: `${publicAppUrl}/@:accountId/endorsements`,
  },
  // Legacy stand kinds normalize to the app's standing kinds.
  {
    source: '/u/:accountId/stand/solidarity',
    destination: `${publicAppUrl}/@:accountId/standing/mutual`,
  },
  {
    source: '/u/:accountId/stand/standing',
    destination: `${publicAppUrl}/@:accountId/standing/incoming`,
  },
  {
    source: '/u/:accountId/stand/standings',
    destination: `${publicAppUrl}/@:accountId/standing/incoming`,
  },
  {
    source: '/u/:accountId/stand/:kind',
    destination: `${publicAppUrl}/@:accountId/standing/:kind`,
  },
  {
    source: '/discover',
    destination: `${publicAppUrl}/discover`,
  },
  {
    source: '/boost',
    destination: `${publicAppUrl}/home?sheet=boost`,
  },
  {
    source: '/boost/leaderboard',
    destination: `${publicAppUrl}/home?sheet=boost`,
  },
  {
    source: '/season',
    destination: `${publicAppUrl}/home?sheet=rally`,
  },
  {
    source: '/season-zero',
    destination: `${publicAppUrl}/home?sheet=rally&season=season-zero`,
  },
].map((redirect) => ({ ...redirect, permanent: false }));

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Turbopack is the default bundler in Next.js 16
  turbopack: {},
  async redirects() {
    return socialAppRedirects;
  },
  serverExternalPackages: ['@ref-finance/ref-sdk', 'near-api-js'],
  // Keep webpack config as fallback for `next build --webpack`
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
