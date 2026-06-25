'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useOverlayClose } from '@/hooks/use-overlay-close';
import { OverlayCloseButton } from '@/components/overlay/overlay-close-button';
import { OverlayHeader } from '@/components/overlay/overlay-header';

interface GlassOverlayShellProps {
  accountId: string;
  title: string;
  description?: string;
  children: ReactNode;
}

const PEEK_VIEWPORT_RATIO = 0.6;
const DISMISS_GAP = 96;

type Detent = 'peek' | 'full';

export function GlassOverlayShell({
  accountId,
  title,
  description,
  children,
}: GlassOverlayShellProps) {
  const close = useOverlayClose(accountId);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startY: number;
    baseY: number;
    panelH: number;
  } | null>(null);

  const [open, setOpen] = useState(false);
  const [detent, setDetent] = useState<Detent>('peek');
  const [dragPx, setDragPx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useScrollLock(true);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  const isMobile = useCallback(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px)').matches,
    []
  );

  const peekPxFor = (panelH: number) =>
    Math.max(0, panelH - window.innerHeight * PEEK_VIEWPORT_RATIO);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobile()) {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const panelH = panel.offsetHeight;
      const baseY = dragPx ?? (detent === 'full' ? 0 : peekPxFor(panelH));
      dragState.current = { startY: event.clientY, baseY, panelH };
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [detent, dragPx, isMobile]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (!state) {
        return;
      }
      const next = Math.min(
        state.panelH,
        Math.max(0, state.baseY + (event.clientY - state.startY))
      );
      setDragPx(next);
    },
    []
  );

  const handlePointerEnd = useCallback(() => {
    const state = dragState.current;
    if (!state) {
      return;
    }
    dragState.current = null;
    setDragging(false);

    const peekPx = peekPxFor(state.panelH);
    const current = dragPx ?? peekPx;

    if (current > peekPx + DISMISS_GAP) {
      close();
      return;
    }

    setDragPx(null);
    setDetent(current < peekPx / 2 ? 'full' : 'peek');
  }, [close, dragPx]);

  const sheetY =
    dragPx != null
      ? `${dragPx}px`
      : detent === 'full'
        ? '0px'
        : `calc(100% - ${Math.round(PEEK_VIEWPORT_RATIO * 100)}dvh)`;

  const panelClassName = `overlay-panel${open ? ' is-open' : ''}${
    dragging ? ' is-dragging' : ''
  }`;

  return (
    <div className="overlay-root" role="presentation">
      <button
        type="button"
        className="overlay-backdrop"
        onClick={close}
        aria-label="Close panel"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="overlay-title"
        className={panelClassName}
        style={{ '--sheet-y': sheetY } as CSSProperties}
      >
        <div
          className="overlay-drag"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <span className="overlay-grip" aria-hidden />
        </div>

        <OverlayHeader
          title={title}
          description={description}
          actions={
            <OverlayCloseButton onClick={close} ariaLabel={`Close ${title}`} />
          }
        />

        <div className="overlay-body">{children}</div>
      </div>
    </div>
  );
}
