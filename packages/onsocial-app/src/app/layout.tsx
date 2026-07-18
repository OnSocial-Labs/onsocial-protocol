import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import {
  Caveat,
  DM_Sans,
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
  display: 'swap',
  // Include Light so post #/@/$ / links at weight 300 actually render lighter.
  weight: ['300', '400', '500', '600', '700'],
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
  themeColor: '#000000',
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
      className={`${dmSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${newsreader.variable} ${caveat.variable} ${ericaType.variable}`}
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
