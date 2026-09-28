'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { daoPath } from '@/lib/app-routes';
import { resolveProtocolFaceDaoKind } from '@/lib/portfolio-dao-entity';
import type { ProtocolFaceDaoKind } from '@/lib/portfolio-dao-entity';
import {
  protocolFacePairIndex,
  protocolFacePairKindFromPager,
  protocolFacePairProgress,
  protocolFacePairThumbBox,
} from '@/lib/protocol-face-pair';
import { replaceBrowserUrl } from '@/lib/sync-browser-url-query';

const ProtocolFacePairInsetContext = createContext(false);
const ProtocolFacePairActiveContext = createContext<string | null>(null);

/** True while this face is sliding inside the Governance / Treasury pair. */
export function useProtocolFacePairInset(): boolean {
  return useContext(ProtocolFacePairInsetContext);
}

/**
 * Account id of the face currently settled in the pair.
 * Null outside the pair. Sheets and the OS clip host follow this face.
 */
export function useProtocolFacePairActiveAccount(): string | null {
  return useContext(ProtocolFacePairActiveContext);
}

const PAIR_ACCOUNT: Record<ProtocolFaceDaoKind, string> = {
  governance: GOVERNANCE_DAO_ACCOUNT,
  treasury: TREASURY_DAO_ACCOUNT,
};

function pairMotion(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}

function placeProtocolFaceChrome(pair: HTMLElement, pager: HTMLElement): void {
  const progress = protocolFacePairProgress(
    pager.scrollLeft,
    pager.clientWidth
  );
  const pill = pair.querySelector<HTMLElement>('.protocol-face-pair-pill');
  const buttons = pill
    ? [...pill.querySelectorAll<HTMLElement>('[role="tab"]')]
    : [];
  const thumb = pill?.querySelector<HTMLElement>('.protocol-face-pair-thumb');
  const sample = buttons[0];
  if (pill && thumb && sample) {
    const box = protocolFacePairThumbBox(
      progress,
      buttons.map((button) => ({
        left: button.offsetLeft,
        width: button.offsetWidth,
      }))
    );
    if (box) {
      thumb.style.width = `${box.width}px`;
      thumb.style.height = `${sample.offsetHeight}px`;
      thumb.style.transform = `translate3d(${box.left}px, ${sample.offsetTop}px, 0)`;
    }
  }

  const pages = [...pair.querySelectorAll<HTMLElement>('.protocol-face-page')];
  const pairRect = pair.getBoundingClientRect();
  const tops = pages.map((page) => {
    const spacer = page.querySelector<HTMLElement>(
      '.portfolio-entity-kind-switch'
    );
    if (!spacer) return null;
    return spacer.getBoundingClientRect().top - pairRect.top;
  });
  const from = tops[0];
  const to = tops[1];
  // Either face can still be streaming. Place from the one that is here.
  const start = from ?? to;
  const end = to ?? from;
  if (pill && start != null && end != null) {
    pill.style.top = `${start + (end - start) * progress}px`;
    pill.dataset.placed = 'true';
  }

  const settled = protocolFacePairKindFromPager(
    pager.scrollLeft,
    pager.clientWidth
  );
  const frame = pair.querySelector<HTMLElement>(
    `.protocol-face-page[data-face="${settled}"] .portfolio-frame`
  );
  if (frame) {
    if (frame.dataset.mood) pair.dataset.mood = frame.dataset.mood;
    const computed = getComputedStyle(frame);
    pair.style.setProperty(
      '--mood-text',
      computed.getPropertyValue('--mood-text')
    );
    pair.style.setProperty(
      '--mood-muted',
      computed.getPropertyValue('--mood-muted')
    );
  }
  for (const page of pages) {
    const on = page.dataset.face === settled;
    page.classList.toggle('is-active', on);
    page.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
}

export function ProtocolFacePairFallback() {
  return (
    <div className="protocol-face-pair-fallback" aria-busy="true">
      <span className="sr-only">Loading face</span>
    </div>
  );
}

/**
 * Governance and Treasury stay mounted side by side. The words stay; the
 * faces slide. The address updates when the slide settles, without a new
 * page load, so each face keeps its place.
 */
export function ProtocolFacePair({
  activeAccountId,
  governance,
  treasury,
}: {
  activeAccountId: string;
  governance: ReactNode;
  treasury: ReactNode;
}) {
  const initialKind =
    resolveProtocolFaceDaoKind(activeAccountId) ?? 'governance';
  const [settled, setSettled] = useState<ProtocolFaceDaoKind>(initialKind);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const pairRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<'open' | 'select' | 'pager'>('open');
  const settledRef = useRef(initialKind);
  const selectingRef = useRef(false);

  const alignPager = useCallback((behavior: ScrollBehavior) => {
    const pager = pagerRef.current;
    if (!pager || pager.clientWidth <= 0) return;
    const left = protocolFacePairIndex(settledRef.current) * pager.clientWidth;
    if (Math.abs(pager.scrollLeft - left) < 2) return;
    pager.scrollTo({ left, behavior });
  }, []);

  const publishSettled = useCallback((next: ProtocolFaceDaoKind) => {
    if (next === settledRef.current) return;
    settledRef.current = next;
    setSettled(next);
    replaceBrowserUrl(daoPath(PAIR_ACCOUNT[next]));
    const pair = pairRef.current;
    const name = pair
      ?.querySelector<HTMLElement>(
        `.protocol-face-page[data-face="${next}"] .portfolio-name`
      )
      ?.textContent?.trim();
    if (name) document.title = `${name} • OnSocial`;
  }, []);

  useLayoutEffect(() => {
    const pager = pagerRef.current;
    const pair = pairRef.current;
    if (!pager || !pair) return;
    if (sourceRef.current === 'pager') {
      sourceRef.current = 'open';
      placeProtocolFaceChrome(pair, pager);
      return;
    }
    const behavior = sourceRef.current === 'select' ? pairMotion() : 'auto';
    sourceRef.current = 'open';
    alignPager(behavior);
    placeProtocolFaceChrome(pair, pager);
  }, [alignPager, settled]);

  useEffect(() => {
    const pager = pagerRef.current;
    const pair = pairRef.current;
    if (!pager || !pair) return;
    const place = () => placeProtocolFaceChrome(pair, pager);
    const onScroll = () => {
      place();
      if (selectingRef.current) {
        const target =
          protocolFacePairIndex(settledRef.current) * pager.clientWidth;
        if (Math.abs(pager.scrollLeft - target) < 2) {
          selectingRef.current = false;
        }
        return;
      }
      const next = protocolFacePairKindFromPager(
        pager.scrollLeft,
        pager.clientWidth
      );
      if (next === settledRef.current) return;
      sourceRef.current = 'pager';
      publishSettled(next);
    };
    const releaseSelect = () => {
      selectingRef.current = false;
    };
    pager.addEventListener('scroll', onScroll, { passive: true });
    pager.addEventListener('pointerdown', releaseSelect);
    const observer = new ResizeObserver(() => {
      place();
      if (sourceRef.current === 'pager') return;
      alignPager('auto');
    });
    observer.observe(pager);
    observer.observe(pair);
    place();
    return () => {
      pager.removeEventListener('scroll', onScroll);
      pager.removeEventListener('pointerdown', releaseSelect);
      observer.disconnect();
    };
  }, [alignPager, publishSettled]);

  const selectKind = useCallback(
    (next: ProtocolFaceDaoKind) => {
      if (next === settledRef.current) return;
      selectingRef.current = true;
      sourceRef.current = 'select';
      publishSettled(next);
    },
    [publishSettled]
  );

  return (
    <ProtocolFacePairInsetContext.Provider value={true}>
      <ProtocolFacePairActiveContext.Provider value={PAIR_ACCOUNT[settled]}>
        <div ref={pairRef} className="protocol-face-pair">
          <div
            className="portfolio-entity-kind portfolio-entity-kind-switch protocol-face-pair-pill"
            role="tablist"
            aria-label="Protocol DAO"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
                return;
              }
              event.preventDefault();
              selectKind(
                event.key === 'ArrowRight' ? 'treasury' : 'governance'
              );
            }}
          >
            <span className="protocol-face-pair-thumb" aria-hidden />
            <button
              type="button"
              role="tab"
              id="protocol-face-tab-governance"
              aria-selected={settled === 'governance'}
              aria-controls="protocol-face-governance"
              className={`portfolio-entity-kind-option${settled === 'governance' ? ' is-active' : ''}`}
              onClick={() => selectKind('governance')}
            >
              Governance
            </button>
            <button
              type="button"
              role="tab"
              id="protocol-face-tab-treasury"
              aria-selected={settled === 'treasury'}
              aria-controls="protocol-face-treasury"
              className={`portfolio-entity-kind-option${settled === 'treasury' ? ' is-active' : ''}`}
              onClick={() => selectKind('treasury')}
            >
              Treasury
            </button>
          </div>
          <div ref={pagerRef} className="protocol-face-pager">
            <div
              id="protocol-face-governance"
              className={`protocol-face-page${settled === 'governance' ? ' is-active' : ''}`}
              data-face="governance"
              aria-hidden={settled === 'governance' ? undefined : true}
            >
              {governance}
            </div>
            <div
              id="protocol-face-treasury"
              className={`protocol-face-page${settled === 'treasury' ? ' is-active' : ''}`}
              data-face="treasury"
              aria-hidden={settled === 'treasury' ? undefined : true}
            >
              {treasury}
            </div>
          </div>
        </div>
      </ProtocolFacePairActiveContext.Provider>
    </ProtocolFacePairInsetContext.Provider>
  );
}
