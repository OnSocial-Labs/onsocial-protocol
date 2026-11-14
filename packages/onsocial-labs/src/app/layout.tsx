import type { Metadata, Viewport } from 'next';
import { inter } from './fonts';
import './globals.css';

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
