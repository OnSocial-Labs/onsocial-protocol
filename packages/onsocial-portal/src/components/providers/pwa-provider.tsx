'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

type PwaContextValue = {
  canInstall: boolean;
  isInstalled: boolean;
  install: () => Promise<boolean>;
};

const DEV_SW_CLEANUP_RELOAD_FLAG = 'onsocial-dev-sw-cleanup-reload';

const PwaContext = createContext<PwaContextValue | null>(null);

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone
    )
  );
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneMode());

    const mediaQuery = window.matchMedia('(display-mode: standalone)');

    const syncStandaloneState = () => {
      setIsInstalled(isStandaloneMode());
    };

    syncStandaloneState();
    mediaQuery.addEventListener('change', syncStandaloneState);

    return () => {
      mediaQuery.removeEventListener('change', syncStandaloneState);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      void Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then(async (registrations) => {
            const matchingRegistrations = registrations.filter((registration) =>
              registration.scope.startsWith(window.location.origin)
            );

            await Promise.all(
              matchingRegistrations.map((registration) =>
                registration.unregister()
              )
            );

            return matchingRegistrations.length > 0;
          })
          .catch(() => false),
        'caches' in window
          ? caches
              .keys()
              .then(async (keys) => {
                const matchingKeys = keys.filter((key) =>
                  key.startsWith('onsocial-portal-shell-')
                );

                await Promise.all(
                  matchingKeys.map((key) => caches.delete(key))
                );

                return matchingKeys.length > 0;
              })
              .catch(() => false)
          : Promise.resolve(false),
      ]).then(([hadRegistrations, hadCaches]) => {
        const shouldReload =
          hadRegistrations || hadCaches || !!navigator.serviceWorker.controller;

        if (!shouldReload) {
          try {
            window.sessionStorage.removeItem(DEV_SW_CLEANUP_RELOAD_FLAG);
          } catch {}
          return;
        }

        try {
          if (
            window.sessionStorage.getItem(DEV_SW_CLEANUP_RELOAD_FLAG) === '1'
          ) {
            window.sessionStorage.removeItem(DEV_SW_CLEANUP_RELOAD_FLAG);
            return;
          }

          window.sessionStorage.setItem(DEV_SW_CLEANUP_RELOAD_FLAG, '1');
        } catch {
          return;
        }

        window.location.reload();
      });

      return;
    }

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) {
      return false;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPromptRef.current = null;
    setCanInstall(false);

    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
      return true;
    }

    return false;
  };

  return (
    <PwaContext.Provider value={{ canInstall, isInstalled, install }}>
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const context = useContext(PwaContext);

  if (!context) {
    throw new Error('usePwa must be used within a PwaProvider');
  }

  return context;
}
