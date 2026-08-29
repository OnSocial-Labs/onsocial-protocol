'use client';

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
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
  osLauncherRootHostedClassName,
  osLauncherSheetClassName,
  osLauncherFrostClassName,
  osLauncherPagesClassName,
  osLauncherPageClassName,
  osLauncherCommunityEmptyClassName,
  osLauncherDotsClassName,
  osLauncherDotClassName,
  resolveBackdropPresentation,
  resolvePanelPresentation,
  SheetCloseButton,
  usePrefersReducedTransparency,
  useScrollLock,
} from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  useComposeLauncher,
  useWriteDockPinned,
  useWriteDockMorph,
} from '@/contexts/compose-launcher-context';
import {
  resolveDockBackVisible,
  useDockBack,
  useSearchChromeActive,
} from '@/contexts/dock-chrome-context';
import { OsWriteDock } from '@/components/os/os-write-dock';
import { useDmUnreadCount } from '@/components/providers/dm-unread-host';
import { useNotificationsUnreadCount } from '@/components/providers/notifications-host';
import { useOsPortalHost } from '@/contexts/os-portal-host-context';
import { accountIdsEqual } from '@/lib/account-match';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { useOsAppNavigate } from '@/hooks/use-os-app-navigate';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import { ThemeToggle } from '@/components/os/theme-toggle';
import { CollectiblesNowPlayingDockChip } from '@/components/os/collectibles-now-playing-dock-chip';
import { PortfolioSummonComposeButton } from '@/components/portfolio/portfolio-summon-compose-button';
import { OsDockPill } from '@/components/wallet/os-dock-pill';
import { OsDockBackZone } from '@/components/wallet/os-dock-back-zone';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  appShellOsApps,
  isOsAppActive,
  ownerPortfolioOsApps,
  resolveActiveOsAppId,
  visitorPortfolioOsApps,
  type OsAppLink,
} from '@/lib/os-apps';
import { OsAppIcon } from '@/lib/os-app-icons';
import { osAppAccent } from '@/lib/os-app-accents';
import { RallyLauncherMark } from '@/features/rally/rally-launcher-mark';
import { useRallySheetOptional } from '@/features/rally/rally-sheet-host';
import { useCommunityAppCatalog } from '@/hooks/use-community-app-catalog';
import { portalHref } from '@/lib/app-links';
import { getCachedAppGatewayAuth } from '@/lib/app-gateway-auth';
import {
  communityAppIdFromLauncherId,
  launchCommunityApp,
  openCommunityAppWindow,
} from '@/lib/community-app-handoff';

const LAUNCHER_DISMISS_PX = 96;
const LAUNCHER_PRESENTATION_MS = 320;
const LAUNCHER_PRESENTATION_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const LAUNCHER_DRAG_ACTIVATION_PX = 6;

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

function probeOsCardHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(
    '.portfolio-frame.app-surface, .os-app-screen.app-surface:not(.os-slide-over)'
  );
}

function launcherAppLabel(app: OsAppLink, openingPage: boolean) {
  if (app.kind === 'open-page' && openingPage) {
    return 'Opening…';
  }

  return app.label;
}

function formatLauncherUnread(count: number): string {
  return count > 9 ? '9+' : String(count);
}

function launcherUnreadForApp(
  appId: string,
  activityUnread: number,
  dmUnread: number
): number {
  if (appId === 'activity') return activityUnread;
  if (appId === 'messages') return dmUnread;
  return 0;
}

function LauncherAppTile({
  app,
  openingPage,
  active,
  unread = 0,
  onActivate,
}: {
  app: OsAppLink;
  openingPage: boolean;
  active: boolean;
  unread?: number;
  onActivate: () => void;
}) {
  const label = launcherAppLabel(app, openingPage);
  const accent = osAppAccent(app.id);
  const tileClassName = `${osLauncherItemClassName}${
    active ? ' is-current' : ''
  }${app.soon ? ' is-soon' : ''}`;
  const ariaLabel = unread > 0 ? `${label}, ${unread} unread` : label;
  const tileBody = (
    <>
      <span
        className={osLauncherItemIconShellClassName}
        data-accent={app.soon ? undefined : accent}
      >
        <OsAppIcon
          appId={app.id}
          iconUrl={app.iconUrl}
          className={osLauncherItemIconClassName}
        />
        {app.soon ? (
          <span className={osLauncherItemSoonClassName}>Soon</span>
        ) : unread > 0 ? (
          <span className="os-launcher-item-badge" aria-hidden="true">
            {formatLauncherUnread(unread)}
          </span>
        ) : null}
      </span>
      <span className={osLauncherItemLabelClassName}>{label}</span>
    </>
  );

  if (app.kind === 'external' && app.href) {
    const community = Boolean(communityAppIdFromLauncherId(app.id));
    return (
      <a
        className={tileClassName}
        href={app.href}
        target="_blank"
        rel="noreferrer"
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        onClick={(event) => {
          if (community) {
            event.preventDefault();
          }
          onActivate();
        }}
      >
        {tileBody}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={tileClassName}
      disabled={app.soon || (app.kind === 'open-page' && openingPage)}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
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
  const pathname = usePathname();
  const { accountId, isConnected, connect } = useAppWallet();
  const rally = useRallySheetOptional();
  const activityUnread = useNotificationsUnreadCount();
  const dmUnread = useDmUnreadCount();
  const { moodId: dockMoodId, style: dockMoodStyle } =
    useViewerDockMood(pageAccountId);
  const { navigate, openingPage } = useOsAppNavigate(pageAccountId);
  const activeAppId = resolveActiveOsAppId(pathname, accountId);
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const communityListings = useCommunityAppCatalog(open);
  const communityReady = communityListings !== null;
  const communityApps = useMemo<OsAppLink[]>(
    () =>
      (communityListings ?? []).map((app) => ({
        id: `community:${app.appId}`,
        label: app.name,
        kind: 'external',
        href: app.href,
        iconUrl: app.iconUrl ?? undefined,
      })),
    [communityListings]
  );
  const [launcherPage, setLauncherPage] = useState(0);
  const pagesRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) {
        setOpenInternal(next);
      }
      onOpenChange?.(next);
    },
    [onOpenChange, openProp]
  );

  const compose = useComposeLauncher();
  const dockBack = useDockBack();
  const searchChromeActive = useSearchChromeActive();
  const writePinned = useWriteDockPinned();
  const writeMorph = useWriteDockMorph();
  const write = compose?.type === 'write' ? compose.entry : null;
  const dockHidden =
    useDockAutoHide(open || writePinned || Boolean(write)) && !open;
  const showDockBack = resolveDockBackVisible({
    dockBack,
    launcherOpen: open,
    searchChromeActive,
  });
  const portalHost = useOsPortalHost();
  const clientMounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );
  // Prefer registered OS / portfolio card. Context can lag a commit behind the
  // card ref — probe the DOM before falling back to body (full-viewport blur).
  const portalTarget = clientMounted
    ? (portalHost ?? probeOsCardHost() ?? document.body)
    : null;
  const launcherHosted =
    portalTarget != null &&
    typeof document !== 'undefined' &&
    portalTarget !== document.body;
  const sheetRef = useRef<HTMLElement>(null);
  const dragStateRef = useRef<{
    startY: number;
    baseY: number;
    panelH: number;
    active: boolean;
  } | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [enterAnimationDone, setEnterAnimationDone] = useState(false);
  const [panelHeightPx, setPanelHeightPx] = useState(0);
  const [openGate, setOpenGate] = useState(open);

  // Reset presentation state when open flips — avoid setState-in-effect.
  if (open !== openGate) {
    setOpenGate(open);
    setEnterAnimationDone(false);
    setPanelHeightPx(0);
    setDragY(0);
    setDragging(false);
    setLauncherPage(0);
  }

  const resetDrag = useCallback(() => {
    setDragY(0);
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
      dragYRef.current = 0;
      dragStateRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = sheetRef.current;
    if (!panel) {
      return;
    }
    const syncHeight = () => setPanelHeightPx(panel.offsetHeight);
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open]);

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

  function handleCommunityActivate(app: OsAppLink) {
    const appId = communityAppIdFromLauncherId(app.id);
    const href = app.href;
    if (!appId || !href) {
      closeLauncher();
      return;
    }
    const popup = openCommunityAppWindow();
    closeLauncher();
    const token = accountId ? getCachedAppGatewayAuth(accountId) : null;
    void launchCommunityApp({ appId, href, token, popup });
  }

  const handleDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const panelH = sheetRef.current?.offsetHeight ?? 480;
      dragStateRef.current = {
        startY: event.clientY,
        baseY: dragYRef.current,
        panelH,
        active: false,
      };
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
      const deltaY = event.clientY - state.startY;
      if (!state.active && Math.abs(deltaY) < LAUNCHER_DRAG_ACTIVATION_PX) {
        return;
      }
      if (!state.active) {
        state.active = true;
        setDragging(true);
        setEnterAnimationDone(true);
      }
      const next = Math.min(state.panelH, Math.max(0, state.baseY + deltaY));
      const rounded = Math.round(next);
      setDragY(rounded);
      dragYRef.current = rounded;
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
    setDragY(0);
  }, [closeLauncher]);

  const handleSheetAnimationEnd = useCallback(
    (event: React.AnimationEvent<HTMLElement>) => {
      if (event.animationName !== 'os-launcher-sheet-in') {
        return;
      }
      setEnterAnimationDone(true);
    },
    []
  );

  const coverProgress =
    panelHeightPx > 0 ? Math.min(1, Math.max(0, dragY / panelHeightPx)) : 0;

  const presentationTransition = dragging
    ? 'none'
    : `opacity ${LAUNCHER_PRESENTATION_MS}ms ${LAUNCHER_PRESENTATION_EASE}, backdrop-filter ${LAUNCHER_PRESENTATION_MS}ms ${LAUNCHER_PRESENTATION_EASE}`;

  const backdropPresentation = useMemo(
    () =>
      resolveBackdropPresentation(coverProgress, {
        reduceTransparency,
      }),
    [coverProgress, reduceTransparency]
  );

  const panelFilter = useMemo(
    () =>
      resolvePanelPresentation(coverProgress, 'os', undefined, {
        reduceTransparency,
      }),
    [coverProgress, reduceTransparency]
  );

  const showEnterAnimation = open && !enterAnimationDone;

  const frostStyle = glassSheetBackdropFilterStyle(panelFilter, {
    transition: presentationTransition,
  });

  const sheetStyle = {
    '--os-launcher-y': `${dragY}px`,
    ...(dragging ? { transform: `translateY(${dragY}px)` } : null),
  } as CSSProperties;

  const backdropStyle = glassSheetBackdropFilterStyle(
    backdropPresentation.filter,
    {
      opacity: showEnterAnimation ? undefined : backdropPresentation.opacity,
      transition: showEnterAnimation ? undefined : presentationTransition,
    }
  );

  return (
    <>
      {!hideTrigger ? (
        <div
          className={`portfolio-summon-dock${open ? ' is-launcher-open' : ''}${dockHidden ? ' is-scroll-hidden' : ''}${write ? ' is-writing' : ''}`}
          data-mood={dockMoodId ?? undefined}
          style={dockMoodStyle}
        >
          {!isConnected ? (
            <button
              type="button"
              className="portfolio-summon-hint portfolio-summon-hint--connect"
              onClick={() => void connect()}
            >
              Connect
            </button>
          ) : null}
          <OsDockPill
            pageAccountId={pageAccountId}
            writeMorph={writeMorph}
            navBack={
              showDockBack && dockBack ? (
                <OsDockBackZone
                  fallbackHref={dockBack.fallbackHref}
                  ariaLabel={dockBack.ariaLabel}
                  onBack={dockBack.onBack}
                />
              ) : undefined
            }
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
            nowPlaying={<CollectiblesNowPlayingDockChip />}
            write={
              write ? (
                <OsWriteDock
                  key={write.draftKey ?? 'write'}
                  placeholder={write.placeholder}
                  ariaLabel={write.ariaLabel}
                  disabled={write.disabled}
                  pending={write.pending}
                  error={write.error}
                  above={write.above}
                  accept={write.accept}
                  draftKey={write.draftKey}
                  onExpand={write.onExpand}
                  onSubmit={write.onSubmit}
                />
              ) : undefined
            }
            action={
              compose?.type === 'action' ? (
                <PortfolioSummonComposeButton compose={compose.entry} />
              ) : undefined
            }
          />
        </div>
      ) : null}

      {open && portalTarget
        ? createPortal(
            <div
              className={`${osLauncherRootClassName}${
                launcherHosted ? ` ${osLauncherRootHostedClassName}` : ''
              }${showEnterAnimation ? ' is-enter' : ''}`}
              role="presentation"
            >
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
                className={`${osLauncherSheetClassName}${
                  showEnterAnimation ? ' is-enter' : ''
                }${dragging ? ' is-dragging' : ''}`}
                style={sheetStyle}
                onAnimationEnd={handleSheetAnimationEnd}
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

                <header
                  className={`standing-sheet-header ${osLauncherHeaderClassName}`}
                >
                  <div className="standing-sheet-subject-row">
                    <div className="standing-sheet-subject">
                      <OnSocialMark
                        className={osLauncherMarkIconClassName}
                        aria-hidden
                      />
                      <span className="standing-sheet-subject-copy">
                        <span className="standing-sheet-subject-name">
                          {launcherPage === 1 ? 'Community' : 'OnSocial'}
                        </span>
                      </span>
                    </div>
                    <div
                      className={`standing-sheet-actions${
                        rally?.mark.visible
                          ? ' os-launcher-header-actions'
                          : ''
                      }`}
                    >
                      {rally?.mark.visible ? (
                        <RallyLauncherMark
                          label={rally.mark.label}
                          nudge={rally.mark.nudge}
                          ariaLabel={rally.mark.ariaLabel}
                          onClick={() => {
                            closeLauncher();
                            rally.openRallySheet();
                          }}
                        />
                      ) : null}
                      <SheetCloseButton
                        onClick={closeLauncher}
                        ariaLabel="Close launcher"
                      />
                    </div>
                  </div>
                </header>

                <div
                  ref={pagesRef}
                  className={osLauncherPagesClassName}
                  onScroll={(event) => {
                    const width = event.currentTarget.clientWidth;
                    if (width <= 0) return;
                    const next = Math.round(
                      event.currentTarget.scrollLeft / width
                    );
                    setLauncherPage(next === 1 ? 1 : 0);
                  }}
                >
                  <ul
                    className={`${osLauncherGridClassName} ${osLauncherPageClassName}`}
                  >
                    {apps.map((app) => (
                      <li key={app.id}>
                        <LauncherAppTile
                          app={app}
                          openingPage={openingPage}
                          active={isOsAppActive(app.id, activeAppId)}
                          unread={launcherUnreadForApp(
                            app.id,
                            activityUnread,
                            dmUnread
                          )}
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
                          active={isOsAppActive('my-page', activeAppId)}
                          onActivate={() => {
                            closeLauncher();
                            router.push(portfolioPath(accountId));
                          }}
                        />
                      </li>
                    ) : null}
                  </ul>
                  <ul
                    className={`${osLauncherGridClassName} ${osLauncherPageClassName}`}
                  >
                    {!communityReady ? null : communityApps.length === 0 ? (
                      <li className={osLauncherCommunityEmptyClassName}>
                        <p>No community dapps yet.</p>
                        <p>
                          <a
                            href={portalHref('/onapi/apps')}
                            target="_blank"
                            rel="noreferrer"
                          >
                            List yours on Portal
                          </a>
                        </p>
                      </li>
                    ) : (
                      communityApps.map((app) => (
                        <li key={app.id}>
                          <LauncherAppTile
                            app={app}
                            openingPage={false}
                            active={false}
                            onActivate={() => {
                              handleCommunityActivate(app);
                            }}
                          />
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div
                  className={osLauncherDotsClassName}
                  aria-label="Launcher pages"
                >
                  <button
                    type="button"
                    className={`${osLauncherDotClassName}${launcherPage === 0 ? ' is-current' : ''}`}
                    aria-label="OnSocial apps"
                    onClick={() => {
                      pagesRef.current?.scrollTo({
                        left: 0,
                        behavior: 'smooth',
                      });
                      setLauncherPage(0);
                    }}
                  />
                  <button
                    type="button"
                    className={`${osLauncherDotClassName}${launcherPage === 1 ? ' is-current' : ''}`}
                    aria-label="Community dapps"
                    onClick={() => {
                      const width = pagesRef.current?.clientWidth ?? 0;
                      pagesRef.current?.scrollTo({
                        left: width,
                        behavior: 'smooth',
                      });
                      setLauncherPage(1);
                    }}
                  />
                </div>

                <div className={osLauncherFooterClassName}>
                  <ThemeToggle />
                </div>
              </section>
            </div>,
            portalTarget
          )
        : null}
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
    isConnected &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId);
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
