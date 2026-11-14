'use client';

/**
 * About workspace — visual twin of the live About page:
 * print | name → crafts (person) or industry (org / DAO); lead; film; More.
 * Lead and More share the bottom format row. Alignment is the essay only.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { ChevronLeftIcon, Divider, OsMediaDismiss } from '@onsocial/ui';
import {
  PROFILE_LEAD_MAX,
  normalizeProfileLeadInput,
  type ProfileAboutAlign,
} from '@onsocial/sdk';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { MediaFramePanSurface } from '@/components/media/media-frame-pan-surface';
import { PortfolioAboutIndustry } from '@/components/portfolio/portfolio-identity-topics';
import { ProfileEssayFormatToolbar } from '@/components/profile/profile-essay-format-toolbar';
import { ProfileBioRichTextarea } from '@/components/wallet/profile-bio-rich-textarea';
import { ProfileTopicsEditor } from '@/components/wallet/profile-topics-editor';
import {
  scrollMobileFieldIntoView,
  useMobileFieldFocusScroll,
} from '@/hooks/use-mobile-field-focus-scroll';
import { usePageKeyboardLift } from '@/hooks/use-page-keyboard-lift';
import {
  keepPageScrollOutside,
  rememberPageScrollOutside,
  restorePageScroll,
  type PageScrollSnap,
} from '@/lib/hold-page-scroll';
import {
  MEDIA_FRAME_PAN_CENTER,
  type MediaFramePan,
} from '@/lib/media-frame-pan';
import {
  PROFILE_BIO_LIMIT_WARN,
  PROFILE_BIO_MAX,
} from '@/lib/profile-bio-face';
import {
  PROFILE_ABOUT_PHOTOS_MAX,
  PROFILE_ABOUT_PHOTO_ACCEPT,
  isProfileAboutPhotoFile,
  moveProfileAboutPhoto,
  profileAboutPhotoKey,
  type ProfileAboutPhotoDraft,
} from '@/lib/profile-about-photos';
import { preserveSheetScroll } from '@/lib/preserve-sheet-scroll';
import { SHEET_Z } from '@/lib/sheet-z';

const ABOUT_FILM_SLOTS = PROFILE_ABOUT_PHOTOS_MAX - 1;
const ABOUT_EDIT_SCROLL_ROOT =
  '.profile-about-edit-slide .os-app-screen-body';

export function ProfileAboutEditorSheet({
  open,
  onClose,
  profileName,
  lead,
  onLeadChange,
  aboutAlign,
  onAboutAlignChange,
  aboutBio,
  onAboutBioChange,
  tags,
  onTagsChange,
  showCrafts = true,
  industry = null,
  photos,
  onPhotosChange,
  disabled = false,
  moodId,
  moodStyle,
}: {
  open: boolean;
  onClose: () => void;
  /** Masthead name — edited on the parent profile sheet. */
  profileName: string;
  lead: string;
  onLeadChange: (value: string) => void;
  aboutAlign: ProfileAboutAlign;
  onAboutAlignChange: (value: ProfileAboutAlign) => void;
  aboutBio: string;
  onAboutBioChange: (value: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  /** Person About only — org / DAO keep leftover tags off About. */
  showCrafts?: boolean;
  /** House sector — read-only echo under the name for org / DAO. */
  industry?: string | null;
  photos: ProfileAboutPhotoDraft[];
  onPhotosChange: (photos: ProfileAboutPhotoDraft[]) => void;
  disabled?: boolean;
  moodId?: string | null;
  moodStyle?: CSSProperties;
}) {
  const formId = useId();
  const aboutBioRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const photoItemRefs = useRef<Array<HTMLLIElement | HTMLElement | null>>([]);
  const photosRef = useRef(photos);
  const dragRef = useRef<{ from: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [formatChromeHost, setFormatChromeHost] =
    useState<HTMLDivElement | null>(null);
  /** Format bar is on screen only while Lead or More has the caret. */
  const [editingField, setEditingField] = useState<'lead' | 'more' | null>(
    null
  );
  const [leadOpen, setLeadOpen] = useState(false);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const pageSnapRef = useRef<PageScrollSnap | null>(null);
  const pinAboutRoot = useCallback(
    () => document.querySelector<HTMLElement>('.profile-about-edit-slide'),
    []
  );
  const { keyboardOpen, panelStyle } = usePageKeyboardLift(open, {
    pinRoot: pinAboutRoot,
  });

  const armAboutPage = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest('.account-editor-bio-shell')) return;
    const scroller = target.closest<HTMLElement>(
      '.profile-about-edit-slide .os-app-screen-body'
    );
    pageSnapRef.current = rememberPageScrollOutside(target, scroller);
  }, []);

  useEffect(() => {
    if (keyboardOpen) return;
    restorePageScroll(pageSnapRef.current);
  }, [keyboardOpen]);

  const aboutLen = aboutBio.replace(/\r\n/g, '\n').length;
  const leadLen = lead.replace(/\r\n/g, '\n').length;
  const aboutNearLimit = aboutLen >= PROFILE_BIO_LIMIT_WARN;
  const leadNearLimit = leadLen >= Math.floor(PROFILE_LEAD_MAX * 0.85);
  const titleLabel = profileName.trim() || 'Name';
  const industryLabel = !showCrafts ? industry?.trim() || null : null;
  const hasMastheadLine =
    Boolean(industryLabel) || (showCrafts && tags.length > 0);
  const print = photos[0] ?? null;
  const film = photos.slice(1);
  const filmSlots: Array<ProfileAboutPhotoDraft | null> = Array.from(
    { length: ABOUT_FILM_SLOTS },
    (_, index) => film[index] ?? null
  );
  const atMax = photos.length >= PROFILE_ABOUT_PHOTOS_MAX;
  const canReorder = !disabled && photos.length > 1;
  const hasPrint = Boolean(print);
  const hasFilm = film.length > 0;
  const hasLeadCopy = lead.trim().length > 0;
  /** Live only paints lead above film; editor reveals a quiet ghost until then. */
  const showLeadEditor = hasFilm || hasLeadCopy || leadOpen;
  const canAddFilm = hasPrint && !atMax;

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const prevLeadOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = leadOpen && !prevLeadOpenRef.current;
    prevLeadOpenRef.current = leadOpen;
    if (!justOpened || !showLeadEditor) return;
    const id = window.setTimeout(() => {
      const node = leadRef.current;
      if (!node) return;
      armAboutPage(node);
      node.focus();
      keepPageScrollOutside(pageSnapRef.current);
    }, 0);
    return () => window.clearTimeout(id);
  }, [armAboutPage, leadOpen, showLeadEditor]);

  const handleClose = () => {
    setEditingField(null);
    setLeadOpen(false);
    prevLeadOpenRef.current = false;
    onClose();
  };

  const blurRich = (
    event: FocusEvent<HTMLDivElement>,
    value: string,
    onChange: (next: string) => void,
    field: 'lead' | 'more'
  ) => {
    const next = event.relatedTarget;
    const stayingInFormat =
      next instanceof Node &&
      (formatChromeHost?.contains(next) ||
        (next instanceof Element &&
          Boolean(next.closest('.profile-about-edit-format-toolbar'))));
    if (stayingInFormat) {
      return;
    }
    const movingToRich =
      next instanceof Element &&
      Boolean(
        next.closest(
          '.account-editor-bio-shell--about, .account-editor-bio-shell--about-lead'
        )
      );
    if (!movingToRich) setEditingField(null);
    const trimmed =
      field === 'lead' ? normalizeProfileLeadInput(value) : value.trim();
    if (trimmed !== value) onChange(trimmed);
    if (field === 'lead' && !trimmed && !hasFilm) setLeadOpen(false);
  };

  const handleAdd = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    const replaceIndex = replaceIndexRef.current;
    replaceIndexRef.current = null;
    if (!file || disabled || !isProfileAboutPhotoFile(file)) return;
    const url = URL.createObjectURL(file);
    const nextPhoto: ProfileAboutPhotoDraft = {
      key: `local:${crypto.randomUUID()}`,
      ref: `local:${file.name}`,
      url,
      file,
      pan: MEDIA_FRAME_PAN_CENTER,
    };
    preserveSheetScroll(ABOUT_EDIT_SCROLL_ROOT, () => {
      if (
        replaceIndex != null &&
        replaceIndex >= 0 &&
        replaceIndex < photosRef.current.length
      ) {
        const removed = photosRef.current[replaceIndex];
        if (removed?.file && removed.url.startsWith('blob:')) {
          URL.revokeObjectURL(removed.url);
        }
        const next = photosRef.current.map((photo, index) =>
          index === replaceIndex ? nextPhoto : photo
        );
        photosRef.current = next;
        onPhotosChange(next);
        return;
      }
      if (atMax) return;
      const next = [...photosRef.current, nextPhoto];
      photosRef.current = next;
      onPhotosChange(next);
    });
  };

  const handleRemove = (index: number) => {
    if (disabled) return;
    preserveSheetScroll(ABOUT_EDIT_SCROLL_ROOT, () => {
      const next = photos.filter((_, itemIndex) => itemIndex !== index);
      const removed = photos[index];
      if (removed?.file && removed.url.startsWith('blob:')) {
        URL.revokeObjectURL(removed.url);
      }
      onPhotosChange(next);
    });
  };

  const setPhotoPan = (index: number, pan: MediaFramePan) => {
    if (disabled) return;
    const next = photosRef.current.map((photo, photoIndex) =>
      photoIndex === index ? { ...photo, pan } : photo
    );
    photosRef.current = next;
    onPhotosChange(next);
  };

  const indexFromPoint = (x: number, y: number): number | null => {
    for (let index = 0; index < photosRef.current.length; index += 1) {
      const el = photoItemRefs.current[index];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return index;
      }
    }
    return null;
  };

  const finishDrag = () => {
    dragRef.current = null;
    setDragFrom(null);
  };

  const handleDragPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (!canReorder || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { from: index };
    setDragFrom(index);
  };

  const handleDragPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const over = indexFromPoint(event.clientX, event.clientY);
    if (over === null || over === drag.from) return;
    const next = moveProfileAboutPhoto(photosRef.current, drag.from, over);
    photosRef.current = next;
    onPhotosChange(next);
    drag.from = over;
    setDragFrom(over);
  };

  const openFilePicker = useCallback(
    (replaceIndex?: number) => {
      if (disabled) return;
      if (replaceIndex == null && atMax) return;
      replaceIndexRef.current = replaceIndex ?? null;
      fileInputRef.current?.click();
    },
    [atMax, disabled]
  );

  const photoControls = (index: number, role: 'print' | 'film'): ReactNode => (
    <div className="profile-about-edit-media-chrome">
      {canReorder ? (
        <button
          type="button"
          className="account-editor-about-photos-drag"
          aria-label={
            role === 'print'
              ? 'Drag to reorder. First photo is the print.'
              : `Drag film photo ${index} to reorder. Drop first to make print.`
          }
          onPointerDown={(event) => handleDragPointerDown(event, index)}
          onPointerMove={handleDragPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <span aria-hidden>⋮⋮</span>
        </button>
      ) : null}
      <OsMediaDismiss
        className="account-editor-about-photos-remove"
        disabled={disabled}
        label={role === 'print' ? 'Remove print' : `Remove film photo ${index}`}
        onClick={() => handleRemove(index)}
      />
    </div>
  );

  const formatToolbar = editingField ? (
    <ProfileEssayFormatToolbar
      align={aboutAlign}
      onAlignChange={onAboutAlignChange}
      disabled={disabled}
      chromeRef={setFormatChromeHost}
      alignGroupLabel="Essay alignment"
      showAlign={editingField === 'more'}
    />
  ) : null;

  return (
    <OsSlideOverScreen
      open={open}
      onClose={handleClose}
      title="Edit about"
      closeAriaLabel="Back"
      closeIcon={
        <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
      }
      closeDisabled={disabled}
      zIndex={SHEET_Z.confirm}
      moodId={moodId ?? undefined}
      moodStyle={moodStyle}
      compactChrome
      className={`profile-edit-slide profile-about-edit-slide${
        keyboardOpen ? ' is-keyboard-open' : ''
      }`}
      style={panelStyle}
      contentClassName="profile-edit-slide-body"
      footer={formatToolbar}
    >
      <form
        id={formId}
        className="account-editor-form profile-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleClose();
        }}
        onPointerDownCapture={(event) => {
          armAboutPage(event.target);
        }}
        onFocusCapture={(event) => {
          const field = event.target;
          if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            (field instanceof HTMLElement && field.isContentEditable)
          ) {
            keepPageScrollOutside(pageSnapRef.current);
            scrollMobileFieldIntoView(field);
          }
        }}
      >
        <div className="account-editor-form-main profile-edit-form-main">
          <article
            className="portfolio-about profile-about-edit-studio"
            data-has-print="true"
            data-has-type="true"
            data-has-film="true"
            data-has-film-lead={
              showLeadEditor && hasLeadCopy ? 'true' : 'false'
            }
          >
            <div className="portfolio-about-spread">
              <figure
                className={`portfolio-about-print profile-about-edit-print${
                  dragFrom === 0 ? ' is-dragging' : ''
                }${!print ? ' is-empty' : ''}`}
                ref={(node) => {
                  photoItemRefs.current[0] = node;
                }}
                aria-label="Print"
              >
                {print ? (
                  <>
                    <span className="profile-about-edit-role" aria-hidden>
                      Print
                    </span>
                    <MediaFramePanSurface
                      src={print.url}
                      pan={print.pan ?? MEDIA_FRAME_PAN_CENTER}
                      onPanChange={(next) => setPhotoPan(0, next)}
                      onTap={() => openFilePicker(0)}
                      disabled={disabled}
                      className="profile-about-edit-pan"
                      imgClassName="portfolio-about-shot is-in"
                    />
                    {photoControls(0, 'print')}
                  </>
                ) : (
                  <button
                    type="button"
                    className="profile-about-edit-slot-add"
                    disabled={disabled || atMax}
                    onClick={() => openFilePicker()}
                  >
                    Add print
                  </button>
                )}
              </figure>

              <div className="portfolio-about-type">
                <header className="portfolio-about-masthead">
                  <h1 className="portfolio-about-name">{titleLabel}</h1>
                  {hasMastheadLine ? (
                    <Divider
                      variant="detail"
                      className="portfolio-about-masthead-rule"
                    />
                  ) : null}
                  {industryLabel ? (
                    <PortfolioAboutIndustry industry={industryLabel} />
                  ) : null}
                  {showCrafts ? (
                    <ProfileTopicsEditor
                      variant="masthead"
                      tags={tags}
                      onChange={onTagsChange}
                      disabled={disabled}
                    />
                  ) : null}
                </header>
              </div>
            </div>

            {showLeadEditor ? (
              <section
                className="portfolio-about-film-lead profile-about-edit-section profile-about-edit-section--lead"
                aria-label="Lead"
              >
                <label htmlFor="profile-about-editor-lead" className="sr-only">
                  Lead
                </label>
                <ProfileBioRichTextarea
                  textareaRef={leadRef}
                  id="profile-about-editor-lead"
                  className="account-editor-bio-shell--about-lead"
                  rows={2}
                  value={lead}
                  maxLength={PROFILE_LEAD_MAX}
                  placeholder="Lead"
                  disabled={disabled}
                  chromePortal={
                    editingField === 'lead' ? formatChromeHost : null
                  }
                  onFocus={(event) => {
                    setEditingField('lead');
                    setLeadOpen(true);
                    scrollFieldIntoView(event);
                  }}
                  onChange={onLeadChange}
                  onBlur={(event) =>
                    blurRich(event, lead, onLeadChange, 'lead')
                  }
                />
                {leadNearLimit ? (
                  <p
                    className="account-editor-limits is-near-limit"
                    aria-live="polite"
                  >
                    {leadLen}/{PROFILE_LEAD_MAX}
                  </p>
                ) : null}
              </section>
            ) : (
              <button
                type="button"
                className="profile-about-edit-lead-ghost"
                disabled={disabled}
                onClick={() => {
                  setLeadOpen(true);
                  setEditingField('lead');
                }}
              >
                Lead
              </button>
            )}

            <ul
              className="portfolio-about-film profile-about-edit-film"
              data-count={String(ABOUT_FILM_SLOTS)}
            >
              {filmSlots.map((still, filmIndex) => {
                const index = filmIndex + 1;
                if (!still) {
                  return (
                    <li
                      key={`film-slot-${filmIndex}`}
                      className="profile-about-edit-film-item is-empty"
                      aria-label={`Film ${filmIndex + 1}`}
                    >
                      <button
                        type="button"
                        className="profile-about-edit-slot-add"
                        disabled={disabled || !canAddFilm}
                        onClick={() => openFilePicker()}
                      >
                        Add film
                      </button>
                    </li>
                  );
                }
                return (
                  <li
                    key={profileAboutPhotoKey(still, index)}
                    ref={(node) => {
                      photoItemRefs.current[index] = node;
                    }}
                    className={[
                      'profile-about-edit-film-item',
                      dragFrom === index ? 'is-dragging' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={`Film ${filmIndex + 1}`}
                  >
                    <span className="profile-about-edit-role" aria-hidden>
                      Film
                    </span>
                    <MediaFramePanSurface
                      src={still.url}
                      pan={still.pan ?? MEDIA_FRAME_PAN_CENTER}
                      onPanChange={(next) => setPhotoPan(index, next)}
                      onTap={() => openFilePicker(index)}
                      disabled={disabled}
                      className="profile-about-edit-pan"
                      imgClassName="portfolio-about-film-shot"
                    />
                    {photoControls(index, 'film')}
                  </li>
                );
              })}
            </ul>

            <section
              className="portfolio-about-essay portfolio-about-rest profile-about-edit-section profile-about-edit-section--story"
              data-about-align={aboutAlign}
              aria-label="More for About"
            >
              <label htmlFor="profile-about-editor-bio" className="sr-only">
                More for About
              </label>
              <ProfileBioRichTextarea
                textareaRef={aboutBioRef}
                id="profile-about-editor-bio"
                className="account-editor-bio-shell--about"
                rows={5}
                value={aboutBio}
                maxLength={PROFILE_BIO_MAX}
                placeholder="More for About"
                disabled={disabled}
                chromePortal={editingField === 'more' ? formatChromeHost : null}
                onFocus={(event) => {
                  setEditingField('more');
                  scrollFieldIntoView(event);
                }}
                onChange={onAboutBioChange}
                onBlur={(event) =>
                  blurRich(event, aboutBio, onAboutBioChange, 'more')
                }
              />
              {aboutNearLimit ? (
                <p
                  className="account-editor-limits is-near-limit"
                  aria-live="polite"
                >
                  {aboutLen}/{PROFILE_BIO_MAX}
                </p>
              ) : null}
            </section>

            <input
              ref={fileInputRef}
              type="file"
              accept={PROFILE_ABOUT_PHOTO_ACCEPT}
              className="account-editor-file-input"
              onChange={handleAdd}
            />
          </article>
        </div>
      </form>
    </OsSlideOverScreen>
  );
}
