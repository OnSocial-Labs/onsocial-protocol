import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import {
  Caveat,
  DM_Sans,
  IBM_Plex_Sans,
  JetBrains_Mono,
  Newsreader,
  Space_Grotesk,
} from 'next/font/google';
import { AppProviders } from '@/components/providers/app-providers';
import { ThemeInitScript } from '@/components/theme-init-script';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  // block, not swap: with swap, rows that painted during the fallback window
  // rendered Arial (no 300) and stayed thick until something re-rendered them
  // (mid-feed rows had no reason to; a boost reorder did — hence “boost fixes
  // it”). block holds text invisible for the instant the woff2 needs instead.
  display: 'block',
  // Variable wght axis — discrete weights were deduped to the same woff2, so
  // font-weight: 300 painted as 400 glyphs.
  weight: 'variable',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-ibm-plex-sans',
  weight: ['400', '500', '600', '700'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  weight: ['400', '500', '600'],
});

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  weight: ['400', '500', '600', '700'],
});

const ericaType = localFont({
  src: [
    {
      path: '../../public/fonts/erica-type/erika_type-webfont.woff',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/erica-type/erika_type_b-webfont.woff',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-erica-type',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OnSocial',
  description: 'A page for every account.',
  applicationName: 'OnSocial',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/onsocial_icon.svg', type: 'image/svg+xml' },
      { url: '/onsocial_icon_192.png', sizes: '192x192', type: 'image/png' },
      { url: '/onsocial_icon_512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OnSocial',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'OnSocial',
    description: 'A page for every account.',
    siteName: 'OnSocial',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c0d10',
  colorScheme: 'dark light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${ibmPlexSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${newsreader.variable} ${caveat.variable} ${ericaType.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <ThemeInitScript />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
