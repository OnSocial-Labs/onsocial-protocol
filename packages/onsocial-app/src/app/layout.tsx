import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Newsreader, Space_Grotesk } from 'next/font/google';
import { AppProviders } from '@/components/providers/app-providers';
import { themeInitScript } from '@/lib/theme-init';
import './globals.css';

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
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${newsreader.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        {/*
          Run in body (not head) so wallet extensions that rewrite the first head
          <script> (e.g. Meteor) do not cause a hydration mismatch on this node.
        */}
        <script
          id="onsocial-theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
