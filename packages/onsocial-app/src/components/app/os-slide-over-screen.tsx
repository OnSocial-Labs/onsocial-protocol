'use client';

/**
 * Full-screen side slide — same glass surface as `OsAppScreen` (feed / create).
 * Close with × (same as sheets). Leave a place is the dock chevron.
 *
 * Portals into the registered `OsPortalHost` (OS / portfolio card with
 * overflow clip) so the panel slides from that edge only.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  MultiplyIcon,
  OsIconAction,
  useScrollLock,
} from '@onsocial/ui';
import { useOsPortalHost } from '@/contexts/os-portal-host-context';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const SLIDE_MS = 280;

export interface OsSlideOverScreenProps {
  open: boolean;
  onClose: () => void;
  /** After the exit slide finishes and the layer unmounts. */
  onClosed?: () => void;
  /**
   * Called before close / Escape starts the exit slide.
   * Return `false` to keep the layer open (e.g. show discard confirm).
   */
  onBeforeClose?: () => boolean;
  title: string;
  subtitle?: string;
  /** Icon actions opposite the close control. */
  actions?: ReactNode;
  /** Replaces the default title/subtitle block (keep `title` for screen readers). */
  heading?: ReactNode;
  /**
   * Hide the nav row (close + title). Keep `title` for the dialog name.
   * Use when the sheet already has a title and close in the body.
   */
  hideNav?: boolean;
  /**
   * Mount on the window (`document.body`), not the OS phone card.
   * Reading should use the glass — browser and PWA already have navigation.
   */
  viewport?: boolean;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /**
   * Overlay chrome on top media (guild page recipe). Banner starts at the
   * screen top; close + title sit on frost. Default is glass chrome with
   * body offset — use this for cover/identity editors.
   */
  immersiveHeader?: boolean;
  zIndex?: number;
  closeAriaLabel?: string;
  /** When true, close + Escape do nothing (e.g. post pending). */
  closeDisabled?: boolean;
  /**
   * Mood wash under glass (`data-mood` + CSS vars).
   * `undefined` (default) → connected viewer mood; `null` → flat screen base.
   */
  moodId?: string | null;
  /** CSS vars; defaults with viewer mood when `moodId` is omitted. */
  moodStyle?: CSSProperties;
  style?: CSSProperties;
  /** Extra class on the root `.os-app-screen` layer. */
  className?: string;
  /** Extra class on the padded content wrapper inside the body. */
  contentClassName?: string;
  /** Scroll container for nested lists (`.os-app-screen-body`). */
  scrollRootRef?: RefObject<HTMLElement | null>;
}

/**
 * Portaled slide-over page shell — feed chrome, viewer mood, × to dismiss.
 */
export function OsSlideOverScreen({
  open,
  onClose,
  onClosed,
  onBeforeClose,
  title,
  subtitle,
  actions,
  heading,
  hideNav = false,
  viewport = false,
  toolbar,
  footer,
  children,
  immersiveHeader = false,
  zIndex = 70,
  closeAriaLabel = 'Close',
  closeDisabled = false,
  moodId,
  moodStyle,
  style,
  className,
  contentClassName,
  scrollRootRef,
}: OsSlideOverScreenProps) {
  const titleId = useId();
  const headerRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  /** Keep mounted through exit when parent sets `open` false. */
  const [renderOpen, setRenderOpen] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  const [glassElevated, setGlassElevated] = useState(false);
  const mounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );
  const registeredHost = useOsPortalHost();
  const viewerMood = useViewerDockMood();
  const resolvedMoodId = moodId !== undefined ? moodId : viewerMood.moodId;
  const resolvedMoodStyle =
    moodStyle !== undefined ? moodStyle : viewerMood.style;
  const hasMood = Boolean(resolvedMoodId);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRenderOpen(true);
      setClosing(false);
      setEntered(false);
    } else if (renderOpen) {
      setClosing(true);
      setEntered(false);
    }
  }

  const layerOpen = renderOpen && !closing;
  const hasFooter = footer != null;
  useScrollLock(renderOpen);

  const finishExit = useCallback(() => {
    setClosing(false);
    setRenderOpen(false);
    onClose();
    onClosed?.();
  }, [onClose, onClosed]);

  const requestClose = useCallback(() => {
    if (closeDisabled || closing) return;
    if (onBeforeClose && onBeforeClose() === false) return;
    setClosing(true);
    setEntered(false);
  }, [closeDisabled, closing, onBeforeClose]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finishExit, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [closing, finishExit]);

  useEffect(() => {
    if (!layerOpen) return;
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [layerOpen]);

  useEffect(() => {
    if (!layerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layerOpen, requestClose]);

  useLayoutEffect(() => {
    if (!renderOpen) return;
    const header = headerRef.current;
    const body = bodyRef.current;
    if (!header || !body) return;
    const screen = header.closest<HTMLElement>('.os-app-screen');

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
  }, [renderOpen, toolbar, subtitle, heading, hideNav]);

  const setBodyRef = useCallback(
    (node: HTMLElement | null) => {
      bodyRef.current = node;
      if (scrollRootRef) {
        scrollRootRef.current = node;
      }
    },
    [scrollRootRef]
  );

  if (!mounted || !renderOpen) return null;

  const portalHost =
    typeof document !== 'undefined'
      ? viewport || !registeredHost
        ? document.body
        : registeredHost
      : null;
  if (!portalHost) return null;

  const rootStyle: CSSProperties = {
    ...resolvedMoodStyle,
    ...style,
    zIndex,
  };

  return createPortal(
    <div
      className={`os-app-screen app-surface os-slide-over${
        entered && !closing ? ' is-open' : ''
      }${closing ? ' is-closing' : ''}${hasMood ? ' os-app-screen--mood os-slide-over--mood' : ''}${
        className ? ` ${className}` : ''
      }`}
      data-tone="os"
      data-immersive-header={immersiveHeader ? 'true' : undefined}
      data-glass-chrome={immersiveHeader ? undefined : 'true'}
      data-screen-footer={hasFooter ? 'true' : undefined}
      data-os-slide-over="true"
      data-hide-nav={hideNav ? 'true' : undefined}
      data-viewport={viewport ? 'true' : undefined}
      data-mood={hasMood ? resolvedMoodId! : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={rootStyle}
    >
      <div className="os-app-screen-column">
        <header
          ref={headerRef}
          className={`os-app-screen-header${
            immersiveHeader ? '' : glassElevated ? ' is-elevated' : ''
          }`}
        >
          {hideNav ? (
            <h1 id={titleId} className="sr-only">
              {title}
            </h1>
          ) : (
            <div className="os-app-screen-nav-row">
              <OsIconAction
                ariaLabel={closeAriaLabel}
                disabled={closeDisabled}
                onClick={requestClose}
              >
                <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
              </OsIconAction>
              <div className="os-app-screen-heading">
                {heading ? (
                  <>
                    <h1 id={titleId} className="sr-only">
                      {title}
                    </h1>
                    {subtitle ? (
                      <p className="sr-only">{subtitle}</p>
                    ) : null}
                    {heading}
                  </>
                ) : (
                  <>
                    <h1 id={titleId} className="os-app-screen-title">
                      {title}
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
          )}
          {toolbar ? (
            <div className="os-app-screen-toolbar">{toolbar}</div>
          ) : null}
        </header>
        <main ref={setBodyRef} className="os-app-screen-body">
          <div
            className={`os-slide-over-content${
              contentClassName ? ` ${contentClassName}` : ''
            }`}
          >
            {children}
          </div>
        </main>
        {hasFooter ? (
          <div className="os-app-screen-footer">
            <div className="os-slide-over-footer-inner">{footer}</div>
          </div>
        ) : null}
      </div>
    </div>,
    portalHost
  );
}
