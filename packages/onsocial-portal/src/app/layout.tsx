import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { RuntimeConfigWarnings } from '@/components/providers/runtime-config-warnings';
import { MobilePageProvider } from '@/components/providers/mobile-page-context';
import { PwaProvider } from '@/components/providers/pwa-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { SmoothScrollProvider } from '@/components/providers/smooth-scroll-provider';
import { WalletProvider } from '@/contexts/wallet-context';
import { Navigation } from '@/components/navigation/navigation';
import { Footer } from '@/components/footer';
import { ACTIVE_NEAR_NETWORK } from '@/lib/near-network';

const inter = Inter({ subsets: ['latin'] });
const isMainnet = ACTIVE_NEAR_NETWORK === 'mainnet';
const applicationName = isMainnet
  ? 'OnSocial Portal'
  : 'OnSocial Portal Testnet';
const description =
  'Build the future of social with OnSocial Protocol. A powerful, scalable decentralized social protocol on NEAR blockchain.';

export const metadata: Metadata = {
  title: 'OnSocial Protocol - Decentralized Social Infrastructure',
  description,
  applicationName,
  manifest: '/manifest.webmanifest',
  keywords: [
    'blockchain',
    'social',
    'decentralized',
    'NEAR',
    'web3',
    'protocol',
  ],
  authors: [{ name: 'OnSocial Labs' }],
  icons: {
    icon: [
      { url: '/onsocial_icon_192.png', sizes: '192x192', type: 'image/png' },
      { url: '/onsocial_icon_512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/onsocial_icon_192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: applicationName,
  },
  openGraph: {
    title: 'OnSocial Protocol',
    description,
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#07111f',
  colorScheme: 'dark light',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} overflow-x-hidden`}>
        {process.env.NODE_ENV !== 'production' ? (
          <Script id="onsocial-dev-sw-reset" strategy="beforeInteractive">
            {`
              (function () {
                var reloadFlag = 'onsocial-dev-prehydrate-sw-reset';
                if (!('serviceWorker' in navigator)) return;

                Promise.all([
                  navigator.serviceWorker.getRegistrations().then(function (registrations) {
                    var matching = registrations.filter(function (registration) {
                      return registration.scope.indexOf(window.location.origin) === 0;
                    });

                    return Promise.all(matching.map(function (registration) {
                      return registration.unregister();
                    })).then(function () {
                      return matching.length > 0;
                    });
                  }).catch(function () { return false; }),
                  ('caches' in window)
                    ? caches.keys().then(function (keys) {
                        var matching = keys.filter(function (key) {
                          return key.indexOf('onsocial-portal-shell-') === 0;
                        });

                        return Promise.all(matching.map(function (key) {
                          return caches.delete(key);
                        })).then(function () {
                          return matching.length > 0;
                        });
                      }).catch(function () { return false; })
                    : Promise.resolve(false)
                ]).then(function (results) {
                  var hadRegistrations = results[0];
                  var hadCaches = results[1];
                  var shouldReload = hadRegistrations || hadCaches || !!navigator.serviceWorker.controller;

                  if (!shouldReload) {
                    try { sessionStorage.removeItem(reloadFlag); } catch (error) {}
                    return;
                  }

                  try {
                    if (sessionStorage.getItem(reloadFlag) === '1') {
                      sessionStorage.removeItem(reloadFlag);
                      return;
                    }

                    sessionStorage.setItem(reloadFlag, '1');
                  } catch (error) {
                    return;
                  }

                  window.location.reload();
                });
              })();
            `}
          </Script>
        ) : null}
        <PwaProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <RuntimeConfigWarnings />
            <WalletProvider network={ACTIVE_NEAR_NETWORK}>
              <MobilePageProvider>
                <Suspense>
                  <SmoothScrollProvider>
                    <Navigation />
                    <main className="safe-x">{children}</main>
                    <Footer />
                  </SmoothScrollProvider>
                </Suspense>
              </MobilePageProvider>
            </WalletProvider>
          </ThemeProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
