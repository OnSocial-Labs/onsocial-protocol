import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

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
