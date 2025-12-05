import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { SmoothScrollProvider } from '@/components/providers/smooth-scroll-provider'
import { WalletProvider } from '@/contexts/wallet-context'
import { Navigation } from '@/components/navigation/navigation'
import { Footer } from '@/components/footer'
import { Spotlight } from '@/components/effects/spotlight'
import { ScrollProgress } from '@/components/effects/scroll-progress'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OnSocial Protocol - Decentralized Social Infrastructure',
  description: 'Build the future of social with OnSocial Protocol. A powerful, scalable decentralized social protocol on NEAR blockchain.',
  keywords: ['blockchain', 'social', 'decentralized', 'NEAR', 'web3', 'protocol'],
  authors: [{ name: 'OnSocial Labs' }],
  openGraph: {
    title: 'OnSocial Protocol',
    description: 'Build the future of social with OnSocial Protocol',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <WalletProvider contractId="guest-book.testnet" network="testnet">
            <SmoothScrollProvider>
              <ScrollProgress />
              <Spotlight />
              <Navigation />
              <main>{children}</main>
              <Footer />
            </SmoothScrollProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
