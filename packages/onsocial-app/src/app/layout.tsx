import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import {
  Caveat,
  IBM_Plex_Sans,
  JetBrains_Mono,
  Newsreader,
  Public_Sans,
  Space_Grotesk,
} from 'next/font/google';
import { ONSOCIAL_BRAND_TAGLINE } from '@onsocial/ui';
import { AppProviders } from '@/components/providers/app-providers';
import { LocaleInitScript } from '@/components/locale-init-script';
import { ThemeInitScript } from '@/components/theme-init-script';
import './globals.css';

// The woff2 is served by us (next/font downloads it at build and hosts the
// file). Devices do not need the face installed — same path DM Sans used.
// `optional` uses the file on first paint when the preload is ready, and
// never swaps a line onto the metric stand-in after paint. `swap` paints
// that stand-in (adjusted Arial) and then replaces it, which is the random
// date face.
const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'optional',
  adjustFontFallback: true,
  weight: 'variable',
  preload: true,
});

const publicSansPl = Public_Sans({
  subsets: ['latin-ext'],
  variable: '--font-public-sans-pl',
  display: 'optional',
  adjustFontFallback: true,
  weight: 'variable',
  preload: false,
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-ibm-plex-sans',
  display: 'optional',
  adjustFontFallback: true,
  weight: ['400', '500', '600', '700'],
});

const ibmPlexSansPl = IBM_Plex_Sans({
  subsets: ['latin-ext'],
  variable: '--font-ibm-plex-sans-pl',
  display: 'optional',
  adjustFontFallback: true,
  weight: ['400', '500', '600', '700'],
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'optional',
  adjustFontFallback: true,
});

const spaceGroteskPl = Space_Grotesk({
  subsets: ['latin-ext'],
  variable: '--font-space-grotesk-pl',
  display: 'optional',
  adjustFontFallback: true,
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'optional',
  adjustFontFallback: true,
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'optional',
  adjustFontFallback: true,
  weight: ['400', '500', '600'],
});

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'optional',
  adjustFontFallback: true,
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
  display: 'optional',
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  title: 'OnSocial',
  description: ONSOCIAL_BRAND_TAGLINE,
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
    description: ONSOCIAL_BRAND_TAGLINE,
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
      className={`${publicSans.variable} ${publicSansPl.variable} ${ibmPlexSans.variable} ${ibmPlexSansPl.variable} ${spaceGrotesk.variable} ${spaceGroteskPl.variable} ${jetbrainsMono.variable} ${newsreader.variable} ${caveat.variable} ${ericaType.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body className={publicSans.className} suppressHydrationWarning>
        <LocaleInitScript />
        <ThemeInitScript />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
