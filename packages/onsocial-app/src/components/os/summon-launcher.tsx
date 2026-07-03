'use client';

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  OnSocialMark,
  glassSheetBackdropFilterStyle,
  osLauncherBackdropClassName,
  osLauncherDragClassName,
  osLauncherFooterClassName,
  osLauncherGridClassName,
  osLauncherHeaderClassName,
  osLauncherItemClassName,
  osLauncherItemIconClassName,
  osLauncherItemIconShellClassName,
  osLauncherItemLabelClassName,
  osLauncherItemSoonClassName,
  osLauncherMarkIconClassName,
  osLauncherRootClassName,
  osLauncherSheetClassName,
  osLauncherFrostClassName,
  resolveGlassScrimBackdropFilter,
  resolveOsGlassPanelFilter,
  SheetCloseButton,
  usePrefersReducedTransparency,
} from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { useOsAppNavigate } from '@/hooks/use-os-app-navigate';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { ThemeToggle } from '@/components/os/theme-toggle';
import { OsDockPill } from '@/components/wallet/os-dock-pill';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  appShellOsApps,
  ownerPortfolioOsApps,
  visitorPortfolioOsApps,
  type OsAppLink,
} from '@/lib/os-apps';
import { OsAppIcon } from '@/lib/os-app-icons';
import { osAppAccent } from '@/lib/os-app-accents';

const LAUNCHER_DISMISS_PX = 96;
const LAUNCHER_MOBILE_MQ = '(max-width: 767px)';

function isLauncherMobile() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia(LAUNCHER_MOBILE_MQ).matches
  );
}

function launcherAppLabel(app: OsAppLink, openingPage: boolean) {
  if (app.kind === 'open-page' && openingPage) {
    return 'Opening…';
  }

  return app.label;
}

function LauncherAppTile({
  app,
  openingPage,
  onActivate,
}: {
  app: OsAppLink;
  openingPage: boolean;
  onActivate: () => void;
}) {
  const label = launcherAppLabel(app, openingPage);
  const accent = osAppAccent(app.id);
  const tileBody = (
    <>
      <span
        className={osLauncherItemIconShellClassName}
        data-accent={app.soon ? undefined : accent}
      >
        <OsAppIcon appId={app.id} className={osLauncherItemIconClassName} />
        {app.soon ? (
          <span className={osLauncherItemSoonClassName}>Soon</span>
        ) : null}
      </span>
      <span className={osLauncherItemLabelClassName}>{label}</span>
    </>
  );

  if (app.kind === 'external' && app.href) {
    return (
      <a
        className={osLauncherItemClassName}
        href={app.href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        onClick={onActivate}
      >
        {tileBody}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={`${osLauncherItemClassName}${app.soon ? ' is-soon' : ''}`}
      disabled={app.soon || (app.kind === 'open-page' && openingPage)}
      aria-label={label}
      onClick={onActivate}
    >
      {tileBody}
    </button>
  );
}

interface SummonLauncherProps {
  apps: OsAppLink[];
  pageAccountId?: string;
  showMyPage?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function SummonLauncher({
  apps,
  pageAccountId,
  showMyPage = false,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: SummonLauncherProps) {
  const router = useRouter();
  const { accountId } = useAppWallet();
  const { navigate, openingPage } = useOsAppNavigate(pageAccountId);
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) {
        setOpenInternal(next);
      }
      onOpenChange?.(next);
    },
    [onOpenChange, openProp]
  );

  const sheetRef = useRef<HTMLElement>(null);
  const dragStateRef = useRef<{ startY: number; baseY: number } | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const resetDrag = useCallback(() => {
    setDragY(null);
    dragYRef.current = 0;
    setDragging(false);
    dragStateRef.current = null;
  }, []);

  const closeLauncher = useCallback(() => {
    resetDrag();
    setOpen(false);
  }, [resetDrag, setOpen]);
  const reduceTransparency = usePrefersReducedTransparency();

  useScrollLock(open);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLauncher();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeLauncher, open]);

  function handleNavigate(app: OsAppLink) {
    if (navigate(app)) {
      closeLauncher();
    }
  }

  const handleDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isLauncherMobile()) {
        return;
      }
      dragStateRef.current = { startY: event.clientY, baseY: dragYRef.current };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    []
  );

  const handleDragPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const state = dragStateRef.current;
      if (!state) {
        return;
      }
      const panelH = sheetRef.current?.offsetHeight ?? 480;
      const next = Math.min(
        panelH,
        Math.max(0, state.baseY + (event.clientY - state.startY))
      );
      setDragY(Math.round(next));
      dragYRef.current = Math.round(next);
    },
    []
  );

  const handleDragPointerEnd = useCallback(() => {
    const state = dragStateRef.current;
    if (!state) {
      return;
    }
    dragStateRef.current = null;
    setDragging(false);

    if (dragYRef.current > LAUNCHER_DISMISS_PX) {
      closeLauncher();
      return;
    }

    dragYRef.current = 0;
    setDragY(null);
  }, [closeLauncher]);

  const frostStyle = glassSheetBackdropFilterStyle(
    resolveOsGlassPanelFilter({ reduceTransparency })
  );

  const sheetStyle = (
    dragging || dragY != null
      ? ({ '--os-launcher-y': `${Math.round(dragY ?? 0)}px` } as CSSProperties)
      : undefined
  ) as CSSProperties;

  const backdropStyle = glassSheetBackdropFilterStyle(
    resolveGlassScrimBackdropFilter({ reduceTransparency })
  );

  return (
    <>
      {!hideTrigger ? (
        <div
          className={`portfolio-summon-dock${open ? ' is-launcher-open' : ''}`}
        >
          <OsDockPill
            pageAccountId={pageAccountId}
            grip={
              <button
                type="button"
                className="portfolio-summon-grip-zone is-interactive"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label="Open launcher"
              >
                <span className="portfolio-summon-grip" aria-hidden />
              </button>
            }
          />
        </div>
      ) : null}

      {open ? (
        <div className={osLauncherRootClassName} role="presentation">
          <button
            type="button"
            className={osLauncherBackdropClassName}
            aria-label="Close launcher"
            style={backdropStyle}
            onClick={closeLauncher}
          />
          <section
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="OnSocial launcher"
            className={`${osLauncherSheetClassName}${dragging ? ' is-dragging' : ''}`}
            style={sheetStyle}
          >
            <div
              className={osLauncherFrostClassName}
              aria-hidden
              style={frostStyle}
            />
            <button
              type="button"
              className={osLauncherDragClassName}
              aria-label="Drag down to close"
              onPointerDown={handleDragPointerDown}
              onPointerMove={handleDragPointerMove}
              onPointerUp={handleDragPointerEnd}
              onPointerCancel={handleDragPointerEnd}
            >
              <span className="glass-sheet-grip" aria-hidden />
            </button>

            <header className={`standing-sheet-header ${osLauncherHeaderClassName}`}>
              <div className="standing-sheet-subject-row">
                <div className="standing-sheet-subject">
                  <OnSocialMark
                    className={osLauncherMarkIconClassName}
                    aria-hidden
                  />
                  <span className="standing-sheet-subject-copy">
                    <span className="standing-sheet-subject-name">OnSocial</span>
                  </span>
                </div>
                <div className="standing-sheet-actions">
                  <SheetCloseButton
                    onClick={closeLauncher}
                    ariaLabel="Close launcher"
                  />
                </div>
              </div>
            </header>

            <ul className={osLauncherGridClassName}>
              {apps.map((app) => (
                <li key={app.id}>
                  <LauncherAppTile
                    app={app}
                    openingPage={openingPage}
                    onActivate={() => {
                      if (app.kind === 'external') {
                        closeLauncher();
                        return;
                      }
                      handleNavigate(app);
                    }}
                  />
                </li>
              ))}
              {showMyPage && accountId ? (
                <li>
                  <LauncherAppTile
                    app={{
                      id: 'my-page',
                      label: 'Page',
                      kind: 'app',
                    }}
                    openingPage={false}
                    onActivate={() => {
                      closeLauncher();
                      router.push(portfolioPath(accountId));
                    }}
                  />
                </li>
              ) : null}
            </ul>

            <div className={osLauncherFooterClassName}>
              <ThemeToggle />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function PortfolioLauncher({
  pageAccountId,
}: {
  pageAccountId: string;
}) {
  const { accountId, isConnected } = useAppWallet();

  const isOwner =
    isConnected && Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);
  const apps = isOwner
    ? ownerPortfolioOsApps(pageAccountId)
    : visitorPortfolioOsApps(pageAccountId);

  return (
    <SummonLauncher
      apps={apps}
      pageAccountId={pageAccountId}
      showMyPage={!isOwner}
    />
  );
}

export function AppShellLauncher() {
  const { accountId } = useAppWallet();
  return <SummonLauncher apps={appShellOsApps(accountId)} />;
}
