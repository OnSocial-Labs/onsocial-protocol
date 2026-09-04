'use client';

/**
 * About workspace nested in Edit profile — topics, continuation bio, photos.
 * Face bio stays on the parent sheet; this matches what visitors open as About.
 */

import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ProfileBioRichTextarea } from '@/components/wallet/profile-bio-rich-textarea';
import {
  ProfileAboutPhotosEditor,
  type ProfileAboutPhotoDraft,
} from '@/components/wallet/profile-about-photos-editor';
import { ProfileTopicsEditor } from '@/components/wallet/profile-topics-editor';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import {
  PROFILE_BIO_LIMIT_WARN,
  PROFILE_BIO_MAX,
  profileBioFace,
} from '@/lib/profile-bio-face';
import { SHEET_Z } from '@/lib/sheet-z';

export function ProfileAboutEditorSheet({
  open,
  onClose,
  faceBio,
  aboutBio,
  onAboutBioChange,
  tags,
  onTagsChange,
  photos,
  onPhotosChange,
  disabled = false,
  moodId,
  moodStyle,
}: {
  open: boolean;
  onClose: () => void;
  faceBio: string;
  aboutBio: string;
  onAboutBioChange: (value: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  photos: ProfileAboutPhotoDraft[];
  onPhotosChange: (photos: ProfileAboutPhotoDraft[]) => void;
  disabled?: boolean;
  moodId?: string | null;
  moodStyle?: CSSProperties;
}) {
  const formId = useId();
  const aboutBioRef = useRef<HTMLDivElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const facePreview = profileBioFace(faceBio);
  const aboutLen = aboutBio.trim().length;
  const nearLimit = aboutLen >= PROFILE_BIO_LIMIT_WARN;

  useLayoutEffect(() => {
    if (!open) return;
    const el = aboutBioRef.current;
    if (!el) return;
    // Never collapse contenteditable height to 0 — Chrome jumps the caret.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [aboutBio, open]);

  return (
    <OsSlideOverScreen
      open={open}
      onClose={onClose}
      title="About"
      closeAriaLabel="Done"
      closeDisabled={disabled}
      zIndex={SHEET_Z.confirm}
      moodId={moodId ?? undefined}
      moodStyle={moodStyle}
      className="profile-edit-slide profile-about-edit-slide"
      contentClassName="profile-edit-slide-body"
      footer={
        <div className="profile-edit-sheet-footer">
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              disabled={disabled}
              onClick={onClose}
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
          onClose();
        }}
      >
        <div className="account-editor-form-main profile-edit-form-main">
          <div className="account-editor-form-body profile-about-edit-body">
            {facePreview ? (
              <div className="profile-about-edit-face-preview">
                <p className="profile-about-edit-face-label">On your page</p>
                <p className="profile-about-edit-face-text">{facePreview}</p>
              </div>
            ) : null}
            <section className="profile-about-edit-section" aria-label="Crafts">
              <p className="profile-about-edit-section-label">Crafts</p>
              <ProfileTopicsEditor
                tags={tags}
                onChange={onTagsChange}
                disabled={disabled}
              />
            </section>
            <section className="profile-about-edit-section" aria-label="About">
              <label htmlFor="profile-about-editor-bio" className="sr-only">
                About
              </label>
              <ProfileBioRichTextarea
                textareaRef={aboutBioRef}
                id="profile-about-editor-bio"
                value={aboutBio}
                maxLength={PROFILE_BIO_MAX}
                placeholder="More for About"
                onFocus={scrollFieldIntoView}
                onChange={onAboutBioChange}
                onBlur={() => {
                  const trimmed = aboutBio.trim();
                  if (trimmed !== aboutBio) onAboutBioChange(trimmed);
                }}
              />
              {nearLimit ? (
                <p
                  className="account-editor-limits is-near-limit"
                  aria-live="polite"
                >
                  {aboutLen}/{PROFILE_BIO_MAX}
                </p>
              ) : null}
            </section>
            <section className="profile-about-edit-section" aria-label="Photos">
              <ProfileAboutPhotosEditor
                photos={photos}
                onChange={onPhotosChange}
                disabled={disabled}
              />
            </section>
          </div>
        </div>
      </form>
    </OsSlideOverScreen>
  );
}
