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
import { ONSOCIAL_BRAND_TAGLINE } from '@onsocial/ui';
import { AppProviders } from '@/components/providers/app-providers';
import { ThemeInitScript } from '@/components/theme-init-script';
import './globals.css';

// The woff2 is served by us. It is not installed on the device, so each
// --font-* variable still carries one metric-adjusted stand-in. `optional`
// never replaces a line that has already painted: the file is used when it is
// ready for first paint (preload + cache), otherwise the stand-in stays for
// that view. `swap` and `block` paint the stand-in and then swap — weight 300
// has no Arial, and 550 is not a static weight — so glyphs change shape and
// the line reflows. Variable wght on DM Sans: discrete weights deduped to one
// woff2 and 300 painted as 400.
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'optional',
  adjustFontFallback: true,
  weight: 'variable',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-ibm-plex-sans',
  display: 'optional',
  adjustFontFallback: true,
  weight: ['400', '500', '600', '700'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'optional',
  adjustFontFallback: true,
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
