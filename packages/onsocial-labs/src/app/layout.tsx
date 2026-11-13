import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const inter = localFont({
  src: '../../public/fonts/inter/inter-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const metadata: Metadata = {
  title: 'OnSocial Labs — Developer API Platform',
  description:
    'Build with the OnSocial API. A single endpoint for social data, queries, and gasless transactions.',
  icons: {
    icon: '/onsocial_icon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'OnSocial Labs — Developer API Platform',
    description:
      'Build with the OnSocial API. A single endpoint for social data, queries, and gasless transactions.',
    siteName: 'OnSocial Labs',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#07111f',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} overflow-x-hidden`}>{children}</body>
    </html>
  );
}
