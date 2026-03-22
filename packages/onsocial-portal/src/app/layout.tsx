import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { RuntimeConfigWarnings } from '@/components/providers/runtime-config-warnings';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { SmoothScrollProvider } from '@/components/providers/smooth-scroll-provider';
import { WalletProvider } from '@/contexts/wallet-context';
import { Navigation } from '@/components/navigation/navigation';
import { Footer } from '@/components/footer';
import { ACTIVE_NEAR_NETWORK } from '@/lib/near-network';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OnSocial Protocol - Decentralized Social Infrastructure',
  description:
    'Build the future of social with OnSocial Protocol. A powerful, scalable decentralized social protocol on NEAR blockchain.',
  keywords: [
    'blockchain',
    'social',
    'decentralized',
    'NEAR',
    'web3',
    'protocol',
  ],
  authors: [{ name: 'OnSocial Labs' }],
  openGraph: {
    title: 'OnSocial Protocol',
    description: 'Build the future of social with OnSocial Protocol',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} overflow-x-hidden`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <RuntimeConfigWarnings />
          <WalletProvider network={ACTIVE_NEAR_NETWORK}>
            <SmoothScrollProvider>
              <Navigation />
              <main>{children}</main>
              <Footer />
            </SmoothScrollProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
