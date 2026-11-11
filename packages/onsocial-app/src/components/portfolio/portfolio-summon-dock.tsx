'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  useComposeLauncher,
  useWriteDockPinned,
  useWriteDockMorph,
} from '@/contexts/compose-launcher-context';
import {
  resolveDockBackVisible,
  useDockBack,
  useImmersiveChromeQuiet,
  type DockBackRegistration,
} from '@/contexts/dock-chrome-context';
import { OsWriteDock } from '@/components/os/os-write-dock';
import { useOsFaceLeave } from '@/components/providers/os-face-leave-provider';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { useSummonDockOccupiedHeight } from '@/hooks/use-summon-dock-occupied-height';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import { accountIdsEqual } from '@/lib/account-match';
import { portfolioMoodShellStyle } from '@/lib/moods/resolve';
import { ownerPortfolioOsApps, visitorPortfolioOsApps } from '@/lib/os-apps';
import { CollectiblesNowPlayingDockChip } from '@/components/os/collectibles-now-playing-dock-chip';
import { SummonLauncher } from '@/components/os/summon-launcher';
import { PortfolioDockMarks } from '@/components/portfolio/portfolio-dock-marks';
import { PortfolioPageContentEntry } from '@/components/portfolio/portfolio-page-entry';
import { PortfolioSummonComposeButton } from '@/components/portfolio/portfolio-summon-compose-button';
import { OsDockBackZone } from '@/components/wallet/os-dock-back-zone';
import { OsDockPill } from '@/components/wallet/os-dock-pill';

const SWIPE_UP_PX = 28;

type FloatBox = { left: number; top: number; right: number; bottom: number };

/** Outer edge of the page-chevron focus ring (`0 0 0 4px`). */
export const CHEVRON_FOCUS_RING_PX = 4;

export function chevronFloatBox(
  pill: { left: number; top: number; width: number },
  size: number,
  gap: number
): FloatBox {
  return {
    left: pill.left + pill.width / 2 - size / 2 - CHEVRON_FOCUS_RING_PX,
    right: pill.left + pill.width / 2 + size / 2 + CHEVRON_FOCUS_RING_PX,
    top: pill.top - gap - size - CHEVRON_FOCUS_RING_PX,
    bottom: pill.top - gap + CHEVRON_FOCUS_RING_PX,
  };
}

export function boxesMeet(a: FloatBox, b: FloatBox): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

/**
 * The lifted hint plus its focus ring. The ring fills the pad, so a content
 * edge on that outer edge counts as a hit. A zero-size hint does not.
 */
export function liftedHintHitsContent(
  hint: FloatBox & { width: number; height: number },
  content: FloatBox
): boolean {
  if (!(hint.width > 0) || !(hint.height > 0)) return false;
  const pad = CHEVRON_FOCUS_RING_PX;
  return (
    hint.left - pad <= content.right &&
    hint.right + pad >= content.left &&
    hint.top - pad <= content.bottom &&
    hint.bottom + pad >= content.top
  );
}

export interface PortfolioSummonDockProps {
  pageAccountId: string;
}


/**
 * One fixed launcher pill for the portfolio — overlays the face and the page
 * drawer (z-index lift while the sheet is open). Scroll-hide follows the drawer
 * body scroller when open, otherwise the main screen scroll.
 */
export function PortfolioSummonDock({
  pageAccountId,
}: PortfolioSummonDockProps) {
  const {
    open: openPageDrawer,
    isOpen: pageDrawerOpen,
    closing: pageDrawerClosing,
    scrollNode,
  } = usePageContentDrawer();
  const { accountId, isConnected } = useAppWallet();
  const compose = useComposeLauncher();
  const dockRef = useRef<HTMLDivElement>(null);
  useSummonDockOccupiedHeight(dockRef, true);
  const writePinned = useWriteDockPinned();
  const writeMorph = useWriteDockMorph();
  const write = compose?.type === 'write' ? compose.entry : null;
  const [chevronCovered, setChevronCovered] = useState(false);
  const registeredDockBack = useDockBack();
  const { leaveHref: faceLeaveHref, consumeLeave } = useOsFaceLeave();
  const router = useRouter();
  const leaveToOrigin = useCallback(() => {
    router.push(consumeLeave());
  }, [consumeLeave, router]);
  const faceDockBack = useMemo<DockBackRegistration>(
    () => ({
      fallbackHref: faceLeaveHref,
      ariaLabel: 'Back',
      onBack: leaveToOrigin,
    }),
    [faceLeaveHref, leaveToOrigin]
  );
  const dockBack = registeredDockBack ?? faceDockBack;

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    let frame = 0;
    const lengthPx = (value: string, font: number) => {
      const text = value.trim();
      if (text.endsWith('rem')) return Number.parseFloat(text) * font;
      if (text.endsWith('px')) return Number.parseFloat(text);
      return Number.NaN;
    };
    const measure = () => {
      if (pageDrawerOpen) {
        setChevronCovered(false);
        return;
      }
      const pill = dock.querySelector(
        '.os-dock-pill:not(.portfolio-page-chevron)'
      );
      const chevron = dock.querySelector('.portfolio-page-chevron');
      if (!(pill instanceof HTMLElement)) return;
      const font =
        Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize
        ) || 16;
      const size = lengthPx(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--os-avatar-nav'
        ),
        font
      );
      const gap = 0.25 * font;
      if (!Number.isFinite(size) || size <= 0) return;
      const pillRect = pill.getBoundingClientRect();
      const outside = (el: Element) =>
        !dock.contains(el) && !el.closest('.glass-sheet-root');
      const regionHits = (meet: (rect: FloatBox) => boolean) => {
        for (const el of document.querySelectorAll(
          'a, button, input, textarea, select, [tabindex]'
        )) {
          if (!(el instanceof HTMLElement) || !outside(el) || el.tabIndex < 0) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) continue;
          if (
            meet({
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            })
          ) {
            return true;
          }
        }
        const caption = document.querySelector('[data-standing-caption]');
        if (caption instanceof HTMLElement && outside(caption)) {
          const rect = caption.getBoundingClientRect();
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            meet({
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            })
          ) {
            return true;
          }
        }
        return false;
      };
      const chevronBox = chevronFloatBox(pillRect, size, gap);
      let covered = regionHits((rect) => boxesMeet(chevronBox, rect));
      if (
        covered &&
        chevron instanceof HTMLElement &&
        document.activeElement === chevron
      ) {
        covered = false;
      }
      setChevronCovered((prev) => (prev === covered ? prev : covered));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(measure);
      });
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    const face = dock.closest('.portfolio-os-layer')?.previousElementSibling;
    if (face instanceof HTMLElement) {
      observer.observe(face);
      const caption = face.querySelector('[data-standing-caption]');
      if (caption instanceof HTMLElement) observer.observe(caption);
    }
    const mutations = new MutationObserver(schedule);
    if (face instanceof HTMLElement) {
      mutations.observe(face, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    const chevron = dock.querySelector('.portfolio-page-chevron');
    chevron?.addEventListener('blur', schedule);
    window.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    const transitionTargets: Element[] = [dock];
    const banner =
      face instanceof HTMLElement
        ? face.querySelector('.portfolio-banner-region')
        : null;
    const standing =
      face instanceof HTMLElement
        ? face.querySelector('[data-standing-caption]')
        : null;
    if (banner instanceof HTMLElement) transitionTargets.push(banner);
    if (standing instanceof HTMLElement) transitionTargets.push(standing);
    for (const target of transitionTargets) {
      target.addEventListener('transitionend', schedule);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      chevron?.removeEventListener('blur', schedule);
      window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
      for (const target of transitionTargets) {
        target.removeEventListener('transitionend', schedule);
      }
    };
  }, [pageDrawerOpen, write]);
  const immersiveChromeQuiet = useImmersiveChromeQuiet();
  const { effectiveMood, isPreviewingMood } = usePortfolioMoodPreview();
  const { isPreviewing: isPreviewingFace } = usePortfolioFacePreview();
  const viewerDockMood = useViewerDockMood(pageAccountId);
  const [osOpen, setOsOpen] = useState(false);
  const [openPinned, setOpenPinned] = useState(false);
  const showDockBack =
    !write &&
    resolveDockBackVisible({
      dockBack,
      launcherOpen: osOpen,
    });

  const previewPinned = isPreviewingMood || isPreviewingFace;

  useEffect(() => {
    if (!pageDrawerOpen) {
      const frame = requestAnimationFrame(() => setOpenPinned(false));
      return () => cancelAnimationFrame(frame);
    }

    const showFrame = requestAnimationFrame(() => setOpenPinned(true));
    const timer = window.setTimeout(() => setOpenPinned(false), 450);
    return () => {
      cancelAnimationFrame(showFrame);
      window.clearTimeout(timer);
    };
  }, [pageDrawerOpen]);

  const scrollRoot = pageDrawerOpen ? scrollNode : null;
  const autoHide = useDockAutoHide(
    previewPinned ||
      openPinned ||
      writePinned ||
      Boolean(write) ||
      (pageDrawerOpen && !scrollNode),
    scrollRoot
  );
  const scrollHidden =
    !osOpen && (immersiveChromeQuiet || (autoHide && !write));

  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressGripClickRef = useRef(false);

  const isOwner =
    isConnected &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId);
  const apps = isOwner
    ? ownerPortfolioOsApps(pageAccountId)
    : visitorPortfolioOsApps(pageAccountId, accountId);

  const dockMoodId = isOwner ? String(effectiveMood.id) : viewerDockMood.moodId;
  const dockMoodStyle = useMemo(() => {
    if (isOwner) {
      return portfolioMoodShellStyle(effectiveMood.cssVars) as CSSProperties;
    }
    return viewerDockMood.style;
  }, [effectiveMood.cssVars, isOwner, viewerDockMood.style]);

  const openLauncher = useCallback(() => {
    setOsOpen(true);
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      pointerStart.current = {
        x: event.clientX,
        y: event.clientY,
      };
    },
    []
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const start = pointerStart.current;
      pointerStart.current = null;
      if (!start || pageDrawerOpen) return;

      const dx = Math.abs(event.clientX - start.x);
      const dy = start.y - event.clientY;
      if (dy > SWIPE_UP_PX && dx < 48) {
        suppressGripClickRef.current = true;
        openPageDrawer();
      }
    },
    [openPageDrawer, pageDrawerOpen]
  );

  const handleGripClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (suppressGripClickRef.current) {
        suppressGripClickRef.current = false;
        event.preventDefault();
        return;
      }
      openLauncher();
    },
    [openLauncher]
  );

  return (
    <>
      <div
        ref={dockRef}
        className={`portfolio-summon-dock${osOpen ? ' is-launcher-open' : ''}${
          scrollHidden ? ' is-scroll-hidden' : ''
        }${pageDrawerOpen ? ' is-drawer-overlay' : ''}${
          pageDrawerOpen && !pageDrawerClosing ? ' is-chevron-concealed' : ''
        }${write ? ' is-writing' : ''}`}
        data-mood={dockMoodId ?? undefined}
        style={dockMoodStyle}
      >
        <div className="portfolio-summon-line">
          {write ? null : (
            <PortfolioPageContentEntry
              open={pageDrawerOpen}
              concealed={pageDrawerOpen && !pageDrawerClosing}
              covered={chevronCovered}
              onOpen={openPageDrawer}
            />
          )}
          <OsDockPill
            pageAccountId={pageAccountId}
            writeMorph={writeMorph}
            navBack={
              showDockBack ? (
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
                className="portfolio-summon-grip-zone is-interactive is-gesture-host"
                aria-haspopup="dialog"
                aria-expanded={osOpen}
                aria-label="Open launcher"
                onPointerDown={handlePointerDown}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
                onClick={handleGripClick}
                onContextMenu={(event) => event.preventDefault()}
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
          {write ? null : <PortfolioDockMarks />}
        </div>
      </div>

      <SummonLauncher
        apps={apps}
        pageAccountId={pageAccountId}
        showMyPage={!isOwner}
        open={osOpen}
        onOpenChange={setOsOpen}
        hideTrigger
      />
    </>
  );
}
