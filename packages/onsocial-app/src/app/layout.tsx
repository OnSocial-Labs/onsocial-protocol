import type { Metadata, Viewport } from 'next';
import { ONSOCIAL_BRAND_TAGLINE } from '@onsocial/ui';
import {
  caveat,
  ericaType,
  ibmPlexSans,
  jetbrainsMono,
  newsreader,
  publicSans,
  spaceGrotesk,
} from '@/fonts';
import { AppProviders } from '@/components/providers/app-providers';
import { ThemeInitScript } from '@/components/theme-init-script';
import { appleStartupImages } from '@/lib/apple-startup-images';
import { THEME_BAR_DARK, THEME_BAR_LIGHT } from '@/lib/theme-init';
import './globals.css';

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
    startupImage: [...appleStartupImages],
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_BAR_LIGHT },
    { media: '(prefers-color-scheme: dark)', color: THEME_BAR_DARK },
  ],
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
      className={`${publicSans.variable} ${ibmPlexSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${newsreader.variable} ${caveat.variable} ${ericaType.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body className={publicSans.className} suppressHydrationWarning>
        <ThemeInitScript />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
