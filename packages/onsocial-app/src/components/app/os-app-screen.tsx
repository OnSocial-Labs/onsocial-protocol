'use client';

import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ContextualBack } from '@/components/app/contextual-back';
import { AppShellLauncher } from '@/components/os/summon-launcher';
import { useRegisterOsPortalHost } from '@/contexts/os-portal-host-context';
import { useRegisterDockBack } from '@/contexts/dock-chrome-context';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';

export interface OsAppScreenProps {
  title: string;
  /** When set, the title navigates here (e.g. guild name → guild page). */
  titleHref?: string;
  subtitle?: string;
  backFallbackHref?: string;
  /**
   * Leading control. `undefined` = contextual back; `null` = none (search roots).
   * When set to a node, `backFallbackHref` is unused.
   */
  leading?: ReactNode | null;
  /** Icon actions pinned opposite the back button (e.g. settings). */
  actions?: ReactNode;
  /** Replaces the default title/subtitle block (keep `title` for screen readers). */
  heading?: ReactNode;
  /** Overlay the header on page media; pair with `headerElevated` on scroll. */
  immersiveHeader?: boolean;
  /** Visual state for an immersive header after content scrolls. */
  headerElevated?: boolean;
  /**
   * Immersive elevate wash — CSS `url("…")` for `--os-immersive-header-banner`
   * (blurred banner behind elevated chrome).
   */
  immersiveHeaderBanner?: string | null;
  /**
   * Shared chrome glass: overlay the header (nav + toolbar rails) on the
   * scroller and frost it once content scrolls under — same recipe as the
   * guild chrome glass. The screen measures its own chrome height and
   * tracks elevation internally. Ignored when `immersiveHeader` is set
   * (immersive screens own their elevation / glass band).
   */
  glassChrome?: boolean;
  /**
   * Slim header — toolbar-only when possible; pairs with frosted glass chrome.
   * Hides the nav row when there is no heading/actions content.
   */
  compactChrome?: boolean;
  /**
   * Move contextual back to the summon dock (hidden while writing / launcher open).
   */
  dockBack?: boolean;
  toolbar?: ReactNode;
  /**
   * Drawer-style dock outside the scroll body (GlassSheet footer recipe).
   * Overlay-pinned above the summon dock so body content frosts underneath.
   */
  footer?: ReactNode;
  /** Scroll container for nested infinite lists (`.os-app-screen-body`). */
  scrollRootRef?: RefObject<HTMLElement | null>;
  /**
   * Mood wash in the app column (`data-mood` + CSS vars).
   * `undefined` (default) → connected viewer mood via `useViewerDockMood`.
   * `null` → flat screen base (no mood).
   * string → explicit mood id (rare override).
   */
  moodId?: string | null;
  /** CSS vars; defaults with viewer mood when `moodId` is omitted. */
  moodStyle?: CSSProperties;
  style?: CSSProperties;
  children: ReactNode;
}

export function OsAppScreen({
  title,
  titleHref,
  subtitle,
  backFallbackHref = '/',
  leading,
  actions,
  heading,
  immersiveHeader = false,
  headerElevated = false,
  immersiveHeaderBanner = null,
  glassChrome = false,
  compactChrome = false,
  dockBack = false,
  toolbar,
  footer,
  scrollRootRef,
  moodId,
  moodStyle,
  style,
  children,
}: OsAppScreenProps) {
  const glassMode = glassChrome && !immersiveHeader;
  const headerRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const portalHostRef = useRegisterOsPortalHost<HTMLDivElement>();
  const [glassElevated, setGlassElevated] = useState(false);
  const hasFooter = footer != null;
  const viewerMood = useViewerDockMood();
  const resolvedMoodId =
    moodId !== undefined ? moodId : viewerMood.moodId;
  const resolvedMoodStyle =
    moodStyle !== undefined ? moodStyle : viewerMood.style;
  const hasMood = Boolean(resolvedMoodId);
  const dockBackEntry = useMemo(
    () =>
      dockBack
        ? { fallbackHref: backFallbackHref, ariaLabel: 'Back' }
        : null,
    [backFallbackHref, dockBack]
  );
  useRegisterDockBack(dockBackEntry);
  const navBackInDock = dockBack && leading === undefined;
  const showNavRow =
    !compactChrome ||
    Boolean(actions || subtitle || heading) ||
    leading != null ||
    navBackInDock;

  const setBodyRef = (node: HTMLElement | null) => {
    bodyRef.current = node;
    if (scrollRootRef) scrollRootRef.current = node;
  };

  useLayoutEffect(() => {
    if (!glassMode) return;
    const header = headerRef.current;
    const body = bodyRef.current;
    if (!header || !body) return;
    const screen = header.closest<HTMLElement>('.os-app-screen');

    // Chrome height varies per screen (search bars, chip rails, auto-hide),
    // so measure it — the body offsets content by this much.
    const syncHeight = () => {
      screen?.style.setProperty(
        '--os-screen-chrome-height',
        `${header.offsetHeight}px`
      );
    };
    const observer = new ResizeObserver(syncHeight);
    observer.observe(header);
    syncHeight();

    const syncElevated = () => {
      setGlassElevated(body.scrollTop > 8);
    };
    syncElevated();
    body.addEventListener('scroll', syncElevated, { passive: true });
    return () => {
      observer.disconnect();
      body.removeEventListener('scroll', syncElevated);
      screen?.style.removeProperty('--os-screen-chrome-height');
    };
  }, [glassMode]);

  const screenStyle: CSSProperties = {
    ...resolvedMoodStyle,
    ...(immersiveHeaderBanner != null && immersiveHeaderBanner !== ''
      ? { ['--os-immersive-header-banner' as string]: immersiveHeaderBanner }
      : null),
    ...style,
  };

  const elevated = headerElevated || (glassMode && glassElevated);

  return (
    <div
      ref={portalHostRef}
      className={`os-app-screen app-surface${hasMood ? ' os-app-screen--mood' : ''}`}
      data-tone="os"
      data-immersive-header={immersiveHeader ? 'true' : undefined}
      data-immersive-banner={immersiveHeaderBanner ? 'true' : undefined}
      data-glass-chrome={glassMode ? 'true' : undefined}
      data-compact-chrome={compactChrome ? 'true' : undefined}
      data-dock-back={dockBack ? 'true' : undefined}
      data-screen-footer={hasFooter ? 'true' : undefined}
      data-mood={hasMood ? resolvedMoodId! : undefined}
      style={screenStyle}
    >
      <div className="os-app-screen-column">
        <header
          ref={headerRef}
          className={`os-app-screen-header${elevated ? ' is-elevated' : ''}`}
        >
          {showNavRow ? (
            <div className="os-app-screen-nav-row">
              {navBackInDock ? null : leading !== undefined ? (
                leading
              ) : (
                <ContextualBack fallbackHref={backFallbackHref} />
              )}
              <div className="os-app-screen-heading">
                {heading ? (
                  <>
                    <h1 className="sr-only">{title}</h1>
                    {heading}
                  </>
                ) : (
                  <>
                    <h1 className="os-app-screen-title">
                      {titleHref ? (
                        <Link
                          href={titleHref}
                          className="os-app-screen-title-link"
                          title={title}
                          scroll={false}
                        >
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                    </h1>
                    {subtitle ? (
                      <p className="os-app-screen-subtitle">{subtitle}</p>
                    ) : null}
                  </>
                )}
              </div>
              {actions ? (
                <div className="os-app-screen-actions">{actions}</div>
              ) : null}
            </div>
          ) : null}
          {toolbar ? (
            <div className="os-app-screen-toolbar">
              {!showNavRow ? <h1 className="sr-only">{title}</h1> : null}
              {toolbar}
            </div>
          ) : null}
        </header>
        <main ref={setBodyRef} className="os-app-screen-body">
          {children}
        </main>
        {hasFooter ? (
          <div className="os-app-screen-footer">{footer}</div>
        ) : null}
      </div>
      <AppShellLauncher />
    </div>
  );
}
