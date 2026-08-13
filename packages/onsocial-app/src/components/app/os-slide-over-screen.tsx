'use client';

/**
 * Full-screen side slide — same glass surface as `OsAppScreen` (feed / create),
 * with a back arrow instead of a sheet close ×.
 * Reuse for nested manage flows that should feel like a pushed page.
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
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftIcon, osIconActionClassName } from '@onsocial/ui';
import { useOsPortalHost } from '@/contexts/os-portal-host-context';
import { useScrollLock } from '@/hooks/use-scroll-lock';
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
   * Called before back / Escape starts the exit slide.
   * Return `false` to keep the layer open (e.g. show discard confirm).
   */
  onBeforeClose?: () => boolean;
  title: string;
  subtitle?: string;
  /** Icon actions opposite the back control. */
  actions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  zIndex?: number;
  closeAriaLabel?: string;
  /** When true, back + Escape do nothing (e.g. post pending). */
  closeDisabled?: boolean;
  /**
   * Mood wash under glass (`data-mood` + CSS vars).
   * `undefined` (default) → connected viewer mood; `null` → blue-corner trial.
   */
  moodId?: string | null;
  /** CSS vars; defaults with viewer mood when `moodId` is omitted. */
  moodStyle?: CSSProperties;
  style?: CSSProperties;
  /** Extra class on the root `.os-app-screen` layer. */
  className?: string;
  /** Extra class on the padded content wrapper inside the body. */
  contentClassName?: string;
}

/**
 * Portaled slide-over page shell — feed chrome, viewer mood, back to dismiss.
 */
export function OsSlideOverScreen({
  open,
  onClose,
  onClosed,
  onBeforeClose,
  title,
  subtitle,
  actions,
  toolbar,
  footer,
  children,
  zIndex = 70,
  closeAriaLabel = 'Back',
  closeDisabled = false,
  moodId,
  moodStyle,
  style,
  className,
  contentClassName,
}: OsSlideOverScreenProps) {
  const titleId = useId();
  const headerRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(open);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  /** Keep mounted through exit when parent sets `open` false. */
  const [renderOpen, setRenderOpen] = useState(open);
  const [glassElevated, setGlassElevated] = useState(false);
  const mounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );
  const registeredHost = useOsPortalHost();
  const viewerMood = useViewerDockMood();
  const resolvedMoodId =
    moodId !== undefined ? moodId : viewerMood.moodId;
  const resolvedMoodStyle =
    moodStyle !== undefined ? moodStyle : viewerMood.style;
  const hasMood = Boolean(resolvedMoodId);

  // Keep latest open for finishExit without reading during render.
  useLayoutEffect(() => {
    openRef.current = open;
  }, [open]);

  // Parent opened — (re)mount and reset exit state.
  useLayoutEffect(() => {
    if (!open) return;
    setRenderOpen(true);
    setClosing(false);
    setEntered(false);
  }, [open]);

  // Parent set open=false while we were showing — run the exit slide.
  useLayoutEffect(() => {
    if (open || !renderOpen) return;
    setClosing(true);
    setEntered(false);
  }, [open, renderOpen]);

  const layerOpen = renderOpen && !closing;
  const hasFooter = footer != null;
  useScrollLock(renderOpen);

  const finishExit = useCallback(() => {
    setClosing(false);
    setRenderOpen(false);
    if (openRef.current) {
      onClose();
    }
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
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
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
  }, [renderOpen, toolbar, subtitle]);

  if (!mounted || !renderOpen) return null;

  const portalHost =
    typeof document !== 'undefined'
      ? (registeredHost ?? document.body)
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
      data-glass-chrome="true"
      data-screen-footer={hasFooter ? 'true' : undefined}
      data-os-slide-over="true"
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
            glassElevated ? ' is-elevated' : ''
          }`}
        >
          <div className="os-app-screen-nav-row">
            <button
              type="button"
              className={osIconActionClassName}
              aria-label={closeAriaLabel}
              disabled={closeDisabled}
              onClick={requestClose}
            >
              <ArrowLeftIcon className="glass-sheet-close-icon" aria-hidden />
            </button>
            <div className="os-app-screen-heading">
              <h1 id={titleId} className="os-app-screen-title">
                {title}
              </h1>
              {subtitle ? (
                <p className="os-app-screen-subtitle">{subtitle}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="os-app-screen-actions">{actions}</div>
            ) : null}
          </div>
          {toolbar ? (
            <div className="os-app-screen-toolbar">{toolbar}</div>
          ) : null}
        </header>
        <main ref={bodyRef} className="os-app-screen-body">
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
