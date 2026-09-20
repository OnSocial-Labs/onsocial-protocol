'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ChevronLeftIcon, OsIconAction } from '@onsocial/ui';
import {
  OsSlideOverScreen,
  useOsSlideOverClose,
} from '@/components/app/os-slide-over-screen';
import { osChromeFrostStyle } from '@/lib/os-chrome-frost';

function MediaFaceClose({ ariaLabel }: { ariaLabel: string }) {
  const requestClose = useOsSlideOverClose();
  return (
    <OsIconAction
      className="os-media-face-close"
      ariaLabel={ariaLabel}
      onClick={() => requestClose?.()}
    >
      <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}

export type OsMediaFaceShellProps = {
  open: boolean;
  onClose: () => void;
  /** Dialog / a11y name. Also the jacket headline unless `faceTitle` is set. */
  title: string;
  /** Jacket headline — e.g. author name while `title` stays the article. */
  faceTitle?: string | null;
  /** Small label above the headline — Writing / Photo / Listen. */
  eyebrow?: string | null;
  /** Secondary line under the jacket title (e.g. Listen track). */
  subtitle?: string | null;
  closeAriaLabel: string;
  zIndex?: number;
  /** Optional thumb / cover art / avatar beside the title. */
  mast?: ReactNode;
  /** Trailing jacket control — e.g. post ⋯. */
  trailing?: ReactNode;
  /** Reading progress scrubber — omit for photo / art / listen. */
  progress?: ReactNode;
  /** Post engagement / commerce — frosted band above the summon dock. */
  footer?: ReactNode;
  /**
   * Words above engagement on the same frost (e.g. post caption peek).
   * Keeps text off the media stage — themed ink, no scrim.
   */
  aboveFooter?: ReactNode;
  /** Full footer slot (skips frost wrap) — e.g. Connect actions. */
  footerChrome?: ReactNode;
  /**
   * Media transport (scrub + controls) in the dock slot under the engagement
   * row — mirrors the write-bar seat on article faces. Icons keep the same
   * dock-clearance seat as every other face. OS column only.
   */
  transport?: ReactNode;
  /** Hide jacket title text (a11y title still on the dialog). */
  quietTitle?: boolean;
  chromeQuiet?: boolean;
  /** Keep summon dock above this face (video transport / reply write). */
  keepDock?: boolean;
  /**
   * `fixed` — photo/thought/mood: stage fills the face; reply keyboard does
   * not reflow media. `scroll` — writing/listen: page can scroll; keyboard
   * lifts the body pad (default).
   */
  stageLayout?: 'fixed' | 'scroll';
  /** Extra root slide class (e.g. feed-photo-slide). */
  className?: string;
  contentClassName?: string;
  /** Extra class on the face body wrapper. */
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  children: ReactNode;
};

/**
 * Shared OS media enlarge chrome — sticky jacket + optional progress +
 * dock-aware frost footer. Medium-specific UI lives only in `children`.
 */
export function OsMediaFaceShell({
  open,
  onClose,
  title,
  faceTitle = null,
  eyebrow = null,
  subtitle = null,
  closeAriaLabel,
  zIndex = 80,
  mast = null,
  trailing = null,
  progress = null,
  footer = null,
  aboveFooter = null,
  footerChrome = null,
  transport = null,
  quietTitle = false,
  chromeQuiet = false,
  keepDock = false,
  stageLayout = 'scroll',
  className,
  contentClassName = 'scarce-read-slide-body',
  bodyClassName,
  bodyStyle,
  children,
}: OsMediaFaceShellProps) {
  const frostStyle = osChromeFrostStyle();
  const dialogName = title.trim() || 'Media';
  const headline = (faceTitle?.trim() || dialogName).trim() || 'Media';
  const brow = eyebrow?.trim() || '';
  const sub = subtitle?.trim() || '';
  const frostedFooter =
    footer != null || aboveFooter != null ? (
      <div className="os-media-face-footer-frost">
        <div
          className="os-media-face-footer-glass"
          aria-hidden
          style={frostStyle}
        />
        {aboveFooter != null ? (
          <div className="os-media-face-footer-lede">{aboveFooter}</div>
        ) : null}
        {footer != null ? (
          <div className="os-media-face-footer">{footer}</div>
        ) : null}
      </div>
    ) : null;
  const stackedFooter =
    frostedFooter != null || transport != null ? (
      <div
        className={`os-media-face-footer-stack${transport ? ' has-transport' : ''}`}
      >
        {frostedFooter}
        {transport}
      </div>
    ) : null;
  const screenFooter = footerChrome ?? stackedFooter;
  const slideClass = [
    'scarce-read-slide',
    'os-media-face',
    stageLayout === 'fixed' ? 'os-media-face--fixed-stage' : '',
    chromeQuiet ? 'is-chrome-quiet' : '',
    transport ? 'has-face-transport' : '',
    className?.trim() || '',
  ]
    .filter(Boolean)
    .join(' ');
  const faceBodyClass = [
    'os-media-face-body',
    chromeQuiet ? 'is-chrome-quiet' : '',
    bodyClassName?.trim() || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <OsSlideOverScreen
      open={open}
      onClose={onClose}
      title={dialogName}
      hideNav
      elevateChrome={false}
      keepDock={keepDock}
      closeAriaLabel={closeAriaLabel}
      zIndex={zIndex}
      className={slideClass}
      contentClassName={contentClassName}
      footer={screenFooter}
    >
      <div className={faceBodyClass} style={bodyStyle}>
        {progress}
        <div className="os-media-face-hero">
          <div
            className="os-media-face-hero-glass"
            aria-hidden
            style={frostStyle}
          />
          <MediaFaceClose ariaLabel={closeAriaLabel} />
          <div className="os-media-face-mast">
            {mast}
            {quietTitle ? null : (
              <div className="os-media-face-copy">
                {brow ? <p className="os-media-face-eyebrow">{brow}</p> : null}
                <p
                  className={
                    faceTitle?.trim()
                      ? 'os-media-face-title os-media-face-title--single'
                      : 'os-media-face-title'
                  }
                >
                  {headline}
                </p>
                {sub ? <p className="os-media-face-subtitle">{sub}</p> : null}
              </div>
            )}
          </div>
          {trailing ? (
            <div className="os-media-face-trailing">{trailing}</div>
          ) : null}
        </div>
        {children}
      </div>
    </OsSlideOverScreen>
  );
}
