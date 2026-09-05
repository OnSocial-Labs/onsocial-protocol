'use client';

/**
 * About workspace — visual twin of the live About page:
 * print | name → crafts; lead; film; More.
 * Lead + More share B / I / • / H under the title.
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
import { Divider, MultiplyIcon, OsSheetAction, OsSheetActions } from '@onsocial/ui';
import {
  PROFILE_ABOUT_ALIGN_OPTIONS,
  PROFILE_LEAD_MAX,
  type ProfileAboutAlign,
} from '@onsocial/sdk';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ProfileBioRichTextarea } from '@/components/wallet/profile-bio-rich-textarea';
import { ProfileTopicsEditor } from '@/components/wallet/profile-topics-editor';
import type { ProfileAboutPhotoDraft } from '@/components/wallet/profile-about-photos-editor';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
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
  swapProfileAboutPhoto,
} from '@/lib/profile-about-photos';
import { SHEET_Z } from '@/lib/sheet-z';

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
  /** Person About only — org / DAO keep industry on the face. */
  showCrafts?: boolean;
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
  const photoItemRefs = useRef<Array<HTMLLIElement | HTMLElement | null>>([]);
  const photosRef = useRef(photos);
  const dragRef = useRef<{ from: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [formatChromeHost, setFormatChromeHost] =
    useState<HTMLDivElement | null>(null);
  const [richTarget, setRichTarget] = useState<'lead' | 'more'>('more');
  const [leadOpen, setLeadOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();

  const aboutLen = aboutBio.replace(/\r\n/g, '\n').length;
  const leadLen = lead.replace(/\r\n/g, '\n').length;
  const aboutNearLimit = aboutLen >= PROFILE_BIO_LIMIT_WARN;
  const leadNearLimit = leadLen >= Math.floor(PROFILE_LEAD_MAX * 0.85);
  const titleLabel = profileName.trim() || 'Name';
  const print = photos[0] ?? null;
  const film = photos.slice(1);
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
    const id = window.setTimeout(() => leadRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [leadOpen, showLeadEditor]);

  const handleClose = () => {
    setRichTarget('more');
    setLeadOpen(false);
    setSelectedPhoto(null);
    prevLeadOpenRef.current = false;
    onClose();
  };

  const handlePhotoActivate = (index: number) => {
    if (disabled || photos.length < 2) return;
    if (selectedPhoto === null) {
      setSelectedPhoto(index);
      return;
    }
    if (selectedPhoto === index) {
      setSelectedPhoto(null);
      return;
    }
    const next = swapProfileAboutPhoto(
      photosRef.current,
      selectedPhoto,
      index
    );
    photosRef.current = next;
    onPhotosChange(next);
    setSelectedPhoto(null);
  };
  const blurRich = (
    event: FocusEvent<HTMLDivElement>,
    value: string,
    onChange: (next: string) => void,
    field: 'lead' | 'more'
  ) => {
    const next = event.relatedTarget;
    if (next instanceof Node && formatChromeHost?.contains(next)) {
      return;
    }
    const trimmed = value.trim();
    if (trimmed !== value) onChange(trimmed);
    if (field === 'lead' && !trimmed && !hasFilm) setLeadOpen(false);
  };

  const handleAdd = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file || disabled || atMax || !isProfileAboutPhotoFile(file)) return;
    const url = URL.createObjectURL(file);
    onPhotosChange([
      ...photos,
      {
        key: `local:${crypto.randomUUID()}`,
        ref: `local:${file.name}`,
        url,
        file,
      },
    ]);
  };

  const handleRemove = (index: number) => {
    if (disabled) return;
    const next = photos.filter((_, itemIndex) => itemIndex !== index);
    const removed = photos[index];
    if (removed?.file && removed.url.startsWith('blob:')) {
      URL.revokeObjectURL(removed.url);
    }
    if (selectedPhoto === index) setSelectedPhoto(null);
    else if (selectedPhoto !== null && selectedPhoto > index) {
      setSelectedPhoto(selectedPhoto - 1);
    }
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

  const openFilePicker = useCallback(() => {
    if (disabled || atMax) return;
    fileInputRef.current?.click();
  }, [atMax, disabled]);

  const photoControls = (
    index: number,
    role: 'print' | 'film'
  ): ReactNode => (
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
      <button
        type="button"
        className="account-editor-about-photos-remove"
        disabled={disabled}
        aria-label={
          role === 'print' ? 'Remove print' : `Remove film photo ${index}`
        }
        onClick={() => handleRemove(index)}
      >
        <MultiplyIcon />
      </button>
    </div>
  );

  return (
    <OsSlideOverScreen
      open={open}
      onClose={handleClose}
      title="About"
      closeAriaLabel="Done"
      closeDisabled={disabled}
      zIndex={SHEET_Z.confirm}
      moodId={moodId ?? undefined}
      moodStyle={moodStyle}
      className="profile-edit-slide profile-about-edit-slide"
      contentClassName="profile-edit-slide-body"
      toolbar={
        <div
          className="profile-about-edit-format-toolbar"
          data-active="true"
        >
          <div
            ref={setFormatChromeHost}
            className="profile-about-edit-format-tools"
            aria-label="Text formatting"
          />
          <div
            className="profile-about-edit-align-tools"
            role="group"
            aria-label="Essay alignment"
          >
            {PROFILE_ABOUT_ALIGN_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`account-editor-bio-tool profile-about-edit-align-tool${
                  aboutAlign === option ? ' is-active' : ''
                }`}
                aria-label={
                  option === 'left'
                    ? 'Align left'
                    : option === 'center'
                      ? 'Align center'
                      : 'Justify'
                }
                aria-pressed={aboutAlign === option}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onAboutAlignChange(option)}
              >
                {option === 'left' ? 'L' : option === 'center' ? 'C' : 'J'}
              </button>
            ))}
          </div>
        </div>
      }
      footer={
        <div className="profile-edit-sheet-footer">
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              disabled={disabled}
              onClick={handleClose}
            >
              Done
            </OsSheetAction>
          </OsSheetActions>
        </div>
      }
    >
      <form
        id={formId}
        className="account-editor-form profile-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleClose();
        }}
      >
        <div className="account-editor-form-main profile-edit-form-main">
          <article
            className="portfolio-about profile-about-edit-studio"
            data-has-print={hasPrint ? 'true' : 'false'}
            data-has-type="true"
            data-has-film={hasFilm ? 'true' : 'false'}
            data-has-film-lead={
              showLeadEditor && hasLeadCopy ? 'true' : 'false'
            }
          >
            <div className="portfolio-about-spread">
              {print ? (
                <figure
                  className={`portfolio-about-print profile-about-edit-print${
                    dragFrom === 0 ? ' is-dragging' : ''
                  }${selectedPhoto === 0 ? ' is-selected' : ''}`}
                  ref={(node) => {
                    photoItemRefs.current[0] = node;
                  }}
                  aria-label="Print"
                >
                  <button
                    type="button"
                    className="profile-about-edit-still-hit"
                    disabled={disabled || photos.length < 2}
                    aria-pressed={selectedPhoto === 0}
                    aria-label={
                      selectedPhoto === null
                        ? 'Select print to swap'
                        : selectedPhoto === 0
                          ? 'Deselect print'
                          : 'Swap with print'
                    }
                    onClick={() => handlePhotoActivate(0)}
                  />
                  <span className="profile-about-edit-role" aria-hidden>
                    Print
                  </span>
                  <img
                    alt=""
                    className="portfolio-about-shot is-in"
                    src={print.url}
                    draggable={false}
                  />
                  {photoControls(0, 'print')}
                </figure>
              ) : null}

              <div className="portfolio-about-type">
                <header className="portfolio-about-masthead">
                  <h1 className="portfolio-about-name">{titleLabel}</h1>
                  {showCrafts && tags.length > 0 ? (
                    <Divider
                      variant="detail"
                      className="portfolio-about-masthead-rule"
                    />
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
                {!hasPrint ? (
                  <button
                    type="button"
                    className="profile-about-edit-print-ghost"
                    disabled={disabled || atMax}
                    onClick={openFilePicker}
                  >
                    Add print
                  </button>
                ) : null}
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
                    richTarget === 'lead' ? formatChromeHost : null
                  }
                  onFocus={(event) => {
                    setRichTarget('lead');
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
                  setRichTarget('lead');
                }}
              >
                Lead
              </button>
            )}

            {hasFilm ? (
              <ul
                className="portfolio-about-film profile-about-edit-film"
                data-count={String(film.length)}
              >
                {film.map((still, filmIndex) => {
                  const index = filmIndex + 1;
                  return (
                    <li
                      key={profileAboutPhotoKey(still, index)}
                      ref={(node) => {
                        photoItemRefs.current[index] = node;
                      }}
                      className={[
                        'profile-about-edit-film-item',
                        dragFrom === index ? 'is-dragging' : '',
                        selectedPhoto === index ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={`Film ${filmIndex + 1}`}
                    >
                      <button
                        type="button"
                        className="profile-about-edit-still-hit"
                        disabled={disabled || photos.length < 2}
                        aria-pressed={selectedPhoto === index}
                        aria-label={
                          selectedPhoto === null
                            ? `Select film ${filmIndex + 1} to swap`
                            : selectedPhoto === index
                              ? `Deselect film ${filmIndex + 1}`
                              : `Swap with film ${filmIndex + 1}`
                        }
                        onClick={() => handlePhotoActivate(index)}
                      />
                      <span className="profile-about-edit-role" aria-hidden>
                        Film
                      </span>
                      <img
                        alt=""
                        className="portfolio-about-film-shot"
                        src={still.url}
                        draggable={false}
                      />
                      {photoControls(index, 'film')}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {canAddFilm ? (
              <button
                type="button"
                className={`profile-about-edit-film-add${
                  hasFilm ? ' is-companion' : ' is-solo'
                }`}
                disabled={disabled}
                onClick={openFilePicker}
              >
                Add film
              </button>
            ) : null}

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
                chromePortal={
                  richTarget === 'more' ? formatChromeHost : null
                }
                onFocus={(event) => {
                  setRichTarget('more');
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
