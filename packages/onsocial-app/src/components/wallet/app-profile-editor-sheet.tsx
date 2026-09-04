'use client';

/**
 * Edit profile — full slide-over workspace (same chrome family as guild edit).
 * Hero media + inline identity/links; screen footer for save.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  PROFILE_FACE_KIND_OPTIONS,
  PROFILE_LOCATION_MAX,
  editorFaceKind,
  profileAvatarShapeFromKind,
  sanitizeProfileLocationDraft,
  type ProfileKind,
} from '@onsocial/sdk';
import {
  DiscardConfirmSheet,
  OsSheetAction,
  OsSheetActions,
  ProfileEditorMediaToolbar,
  useDiscardConfirm,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { ProfileEditorLoadError } from '@/components/wallet/profile-editor-load-error';
import { ProfileEditorLoadingSkeleton } from '@/components/wallet/profile-editor-loading-skeleton';
import { ProfileAboutEditorSheet } from '@/components/wallet/profile-about-editor-sheet';
import { ProfileFaceBioField } from '@/components/wallet/profile-face-bio-field';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { ProfileOrgMetaEditor } from '@/components/wallet/profile-org-meta-editor';
import type { ProfileAboutPhotoDraft } from '@/components/wallet/profile-about-photos-editor';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import {
  useAppProfileEditor,
  type ProfileEditorSaveResult,
  type ProfileEditorSnapshot,
} from '@/hooks/use-app-profile-editor';
import { isProfileEditorDirty } from '@/lib/profile-editor-dirty';
import {
  PAGE_LINK_NOTE_MAX,
  pruneLinkNotes,
  sanitizeLinkNotes,
} from '@/lib/page-launch-config';
import {
  FACE_BIO_LIMIT_WARN,
  FACE_BIO_WRAP_CHARS,
  clampFaceEditorInput,
  clampProfileBioFace,
  profileAboutHasMoreThanFace,
} from '@/lib/profile-bio-face';
import { displayName, fallbackLabel, initials } from '@/lib/profile-display';
import type { ResolvedPageHero } from '@/lib/page-data';
import {
  profileLinkEditorFieldErrors,
  profileLinksInputFromRecord,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { SHEET_Z } from '@/lib/sheet-z';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { nearExplorerTxHref } from '@/lib/app-config';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';

const MOBILE_MAX_WIDTH_PX = 767;
const PROFILE_NAME_MAX = 50;
const PROFILE_NAME_LIMIT_WARN = 40;

const PROFILE_BANNER_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return url;
}

function resolveBannerPreviewMedia(
  file: File | null,
  previewUrl: string | null,
  snapshot: ProfileEditorSnapshot,
  removed: boolean
): ResolvedPageHero | null {
  if (removed) return null;

  if (file && previewUrl) {
    return {
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      url: previewUrl,
    };
  }

  return (
    snapshot.bannerMedia ??
    (snapshot.bannerUrl ? { kind: 'image', url: snapshot.bannerUrl } : null)
  );
}

interface AppProfileEditorSheetProps {
  open: boolean;
  sessionKey: number;
  accountId: string;
  /** Current page account — live shell mood when this is your portfolio. */
  pageAccountId?: string;
  onBack: () => void;
  onClose: () => void;
  onSaved: (result: ProfileEditorSaveResult) => void;
}

/** Nested slide-over — edit profile without leaving the OS account drawer stack. */
export function AppProfileEditorSheet({
  open,
  sessionKey,
  accountId,
  pageAccountId,
  onBack,
  onClose,
  onSaved,
}: AppProfileEditorSheetProps) {
  const formId = useId();
  const { setTxResult } = useAppTransactionFeedback();
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  const {
    snapshot,
    loading,
    saving,
    loadError,
    loadProfile,
    saveProfile,
    linksFromSnapshot,
  } = useAppProfileEditor(accountId, open);
  const { moodId: viewerMoodId, style: viewerMoodStyle } =
    useViewerDockMood(pageAccountId);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [industry, setIndustry] = useState('');
  const [kind, setKind] = useState<ProfileKind>('person');
  const [faceBio, setFaceBio] = useState('');
  const [aboutBio, setAboutBio] = useState('');
  const [lead, setLead] = useState('');
  const [aboutAlign, setAboutAlign] = useState<'left' | 'center' | 'justify'>(
    'left'
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<ProfileAboutPhotoDraft[]>([]);
  const [links, setLinks] = useState<ProfileLinksInput>(() =>
    profileLinksInputFromRecord(null)
  );
  const [linkNotes, setLinkNotes] = useState<Record<string, string>>({});
  const [linkFieldErrors, setLinkFieldErrors] = useState<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [seedKey, setSeedKey] = useState<string | null>(null);

  const readyKey =
    snapshot && open
      ? `${accountId}:${sessionKey}:${snapshot.accountId}`
      : null;

  // Adjust draft when the editor session or loaded snapshot changes (guild pattern).
  if (readyKey && readyKey !== seedKey && snapshot) {
    setSeedKey(readyKey);
    setName(snapshot.name);
    setLocation(snapshot.location);
    setIndustry(snapshot.industry ?? '');
    setKind(editorFaceKind(snapshot.kind));
    setFaceBio(snapshot.bio);
    setAboutBio(snapshot.about ?? '');
    setLead(snapshot.lead ?? '');
    setAboutAlign(snapshot.aboutAlign ?? 'left');
    setAboutOpen(false);
    setTags(snapshot.tags ?? []);
    setPhotos(snapshot.photos ?? []);
    setLinks(linksFromSnapshot);
    setLinkNotes(sanitizeLinkNotes(snapshot.pageConfig?.linkNotes));
    setLinkFieldErrors({});
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarRemoved(false);
    setBannerRemoved(false);
  }

  if (!open && seedKey !== null) {
    setSeedKey(null);
  }

  const handleFaceBioChange = useCallback((next: string) => {
    // Native maxLength is the hard stop; clamp only soft-caps Enter towers.
    setFaceBio(clampFaceEditorInput(next.slice(0, FACE_BIO_WRAP_CHARS)));
  }, []);

  useEffect(() => {
    if (!open || !snapshot) return;
    if (window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches) {
      return;
    }
    const focusTimer = window.setTimeout(() => {
      nameInputRef.current?.focus({ preventScroll: true });
    }, 280);
    return () => window.clearTimeout(focusTimer);
  }, [open, readyKey, snapshot]);

  const avatarPreview = useObjectUrl(avatarFile);
  const bannerPreview = useObjectUrl(bannerFile);
  const displayAvatarUrl =
    !snapshot || avatarRemoved ? null : (avatarPreview ?? snapshot.avatarUrl);
  const displayBannerMedia =
    snapshot && seedKey === readyKey
      ? resolveBannerPreviewMedia(
          bannerFile,
          bannerPreview,
          snapshot,
          bannerRemoved
        )
      : null;

  const isDirty = useMemo(() => {
    if (!snapshot || seedKey !== readyKey) return false;
    return isProfileEditorDirty({
      snapshot,
      linksFromSnapshot,
      name,
      location,
      industry,
      kind,
      bio: faceBio,
      about: aboutBio,
      lead,
      aboutAlign,
      links,
      tags,
      photos,
      photoFiles: photos.map((photo) => photo.file ?? null),
      linkNotes,
      avatarFile,
      bannerFile,
      avatarRemoved,
      bannerRemoved,
    });
  }, [
    avatarFile,
    avatarRemoved,
    bannerFile,
    bannerRemoved,
    aboutBio,
    lead,
    aboutAlign,
    faceBio,
    industry,
    kind,
    links,
    tags,
    photos,
    linkNotes,
    linksFromSnapshot,
    location,
    name,
    readyKey,
    seedKey,
    snapshot,
  ]);

  const handleLeave = useCallback(() => {
    onBack();
  }, [onBack]);

  const {
    discardConfirmOpen,
    requestCloseOrConfirm,
    clearDiscardConfirm,
    keepEditing,
    discard,
  } = useDiscardConfirm({
    open,
    dirty: isDirty,
    pending: saving,
    onClose: handleLeave,
  });

  const handleBeforeClose = useCallback(() => {
    if (aboutOpen) {
      setAboutOpen(false);
      return false;
    }
    if (discardConfirmOpen) {
      keepEditing();
      return false;
    }
    return requestCloseOrConfirm();
  }, [aboutOpen, discardConfirmOpen, keepEditing, requestCloseOrConfirm]);

  const handleClosed = useCallback(() => {
    clearDiscardConfirm();
    onClose();
  }, [clearDiscardConfirm, onClose]);

  const nameReady = name.trim().length > 0;
  const hasInvalidLinks = useMemo(
    () =>
      Object.keys(profileLinkEditorFieldErrors(links)).length > 0 ||
      Object.keys(linkFieldErrors).length > 0,
    [linkFieldErrors, links]
  );
  const hasCurrentLinks = Boolean(
    snapshot?.links && Object.keys(snapshot.links).length > 0
  );
  const hasLinkInput = Object.values(links).some((value) => value.trim());
  const nameNearLimit = name.length >= PROFILE_NAME_LIMIT_WARN;
  const faceBioLen = faceBio.replace(/\r\n/g, '\n').length;
  const faceNearLimit = faceBioLen >= FACE_BIO_LIMIT_WARN;
  const submitLabel = snapshot?.hasProfile === false ? 'Create' : 'Save';
  const handleLabel = fallbackLabel(accountId);
  const avatarInitial = initials(
    displayName(accountId, name.trim() || undefined)
  );
  const canSubmit =
    Boolean(snapshot) && nameReady && !saving && !hasInvalidLinks && isDirty;

  const updateLink = (key: keyof ProfileLinksInput, value: string) => {
    setLinks((current) => ({ ...current, [key]: value }));
  };

  const updateNote = (key: keyof ProfileLinksInput, value: string) => {
    setLinkNotes((current) => {
      const next = { ...current };
      const trimmed = value.trim();
      if (!trimmed) {
        delete next[key];
      } else {
        next[key] = value.slice(0, PAGE_LINK_NOTE_MAX);
      }
      return next;
    });
  };

  const clearLinkFieldError = (key: keyof ProfileLinksInput) => {
    setLinkFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const setLinkFieldError = (
    key: keyof ProfileLinksInput,
    message: string | null
  ) => {
    setLinkFieldErrors((current) => {
      if (!message) {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      if (current[key] === message) return current;
      return { ...current, [key]: message };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!snapshot || !nameReady || saving) {
      return;
    }

    const validationErrors = profileLinkEditorFieldErrors(links);
    if (Object.keys(validationErrors).length > 0) {
      setLinkFieldErrors(validationErrors);
      return;
    }

    try {
      const result = await saveProfile({
        name,
        location,
        industry,
        kind,
        bio: clampProfileBioFace(faceBio),
        about: aboutBio.trim(),
        lead: lead.trim(),
        aboutAlign,
        tags,
        photos,
        photoFiles: photos.map((photo) => photo.file ?? null),
        avatar: avatarFile,
        banner: bannerFile,
        removeAvatar: avatarRemoved,
        removeBanner: bannerRemoved,
        links,
        currentLinks: snapshot.links,
        hasCurrentLinks,
        hasLinkInput,
        linkNotes: pruneLinkNotes(linkNotes, links),
      });
      onSaved(result);
      setTxResult({
        type: 'success',
        msg: txToastSuccess.profileSaved,
        explorerHref: nearExplorerTxHref(result.txHash),
      });
      handleLeave();
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message = err instanceof Error ? err.message : '';
      if (/onsocial link account/i.test(message)) {
        setLinkFieldErrors((current) => ({
          ...current,
          onsocial: 'Account not found on this network',
        }));
        setTxResult({
          type: 'error',
          msg: txToastError.profileOnSocialMissing,
        });
        return;
      }
      setTxResult({ type: 'error', msg: txToastError.profileSaveFailed });
      const nextValidationErrors = profileLinkEditorFieldErrors(links);
      if (Object.keys(nextValidationErrors).length > 0) {
        setLinkFieldErrors(nextValidationErrors);
      }
    }
  };

  const openBannerPicker = () => bannerInputRef.current?.click();

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarRemoved(true);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerRemoved(true);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const formReady = Boolean(snapshot && seedKey === readyKey);

  const footer = (
    <div className="profile-edit-sheet-footer">
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type={formReady ? 'submit' : 'button'}
          form={formReady ? formId : undefined}
          ready={formReady && canSubmit}
          pending={formReady && saving}
          pendingLabel="Saving…"
          disabled={!formReady || !canSubmit}
        >
          {submitLabel}
        </OsSheetAction>
      </OsSheetActions>
    </div>
  );

  return (
    <>
      <OsSlideOverScreen
        open={open}
        onClose={handleLeave}
        onClosed={handleClosed}
        onBeforeClose={handleBeforeClose}
        title="Edit profile"
        closeAriaLabel="Close"
        closeDisabled={saving}
        zIndex={SHEET_Z.overShell}
        moodId={viewerMoodId ?? undefined}
        moodStyle={viewerMoodStyle}
        className="profile-edit-slide"
        contentClassName="profile-edit-slide-body"
        immersiveHeader
        footer={footer}
      >
        {formReady ? (
          <form
            id={formId}
            className="account-editor-form profile-edit-form"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="account-editor-form-main profile-edit-form-main">
              <section
                className="account-editor-hero profile-edit-hero"
                aria-label="Profile"
              >
                <div
                  className={`account-editor-cover-stage${
                    displayBannerMedia ? ' has-media' : ''
                  }`}
                >
                  <div className="account-editor-banner-wrap">
                    <div
                      className={`account-editor-banner-button profile-editor-media-host${
                        displayBannerMedia ? ' has-media' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="profile-editor-media-backdrop account-editor-banner-backdrop"
                        onClick={openBannerPicker}
                        aria-label={
                          displayBannerMedia ? 'Change banner' : 'Add banner'
                        }
                      >
                        {displayBannerMedia?.kind === 'video' ? (
                          <video
                            src={displayBannerMedia.url}
                            poster={displayBannerMedia.poster}
                            className="account-editor-banner-video"
                            muted
                            loop
                            playsInline
                            autoPlay
                            aria-hidden
                          />
                        ) : displayBannerMedia ? (
                          <img
                            src={displayBannerMedia.url}
                            alt=""
                            className="account-editor-banner-image"
                          />
                        ) : (
                          <span
                            className="account-editor-banner-empty"
                            aria-hidden
                          />
                        )}
                        <span
                          className={`account-editor-banner-overlay${
                            displayBannerMedia ? ' has-media' : ''
                          }`}
                          aria-hidden
                        />
                      </button>
                      <ProfileEditorMediaToolbar
                        layout="banner"
                        removeLabel={
                          displayBannerMedia ? 'Remove banner' : undefined
                        }
                        onRemove={
                          displayBannerMedia ? handleRemoveBanner : undefined
                        }
                      />
                      {displayBannerMedia ? null : (
                        <p
                          className="profile-editor-media-size-hint profile-editor-media-size-hint--dock"
                          aria-hidden
                        >
                          Photo or video
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="account-editor-hero-overlap">
                    <div className="account-editor-identity">
                      <div className="account-editor-avatar-wrap">
                        <div
                          className={`account-editor-avatar profile-editor-media-host profile-editor-media-host--avatar${
                            displayAvatarUrl ? ' has-media' : ''
                          }`}
                          data-profile-kind={kind}
                          data-avatar-shape={profileAvatarShapeFromKind(kind)}
                        >
                          <button
                            type="button"
                            className="profile-editor-media-backdrop account-editor-avatar-backdrop"
                            onClick={() => avatarInputRef.current?.click()}
                            aria-label={
                              displayAvatarUrl ? 'Change photo' : 'Add photo'
                            }
                          >
                            {displayAvatarUrl ? (
                              <img
                                src={displayAvatarUrl}
                                alt=""
                                className="account-editor-avatar-image"
                              />
                            ) : (
                              <span
                                className="account-editor-avatar-fallback"
                                aria-hidden
                              >
                                {avatarInitial}
                              </span>
                            )}
                            <span
                              className={`profile-editor-media-overlay account-editor-avatar-overlay${
                                displayAvatarUrl ? ' has-media' : ''
                              }`}
                              aria-hidden
                            />
                          </button>
                          <ProfileEditorMediaToolbar
                            layout="avatar"
                            removeLabel={
                              displayAvatarUrl ? 'Remove photo' : undefined
                            }
                            onRemove={
                              displayAvatarUrl ? handleRemoveAvatar : undefined
                            }
                          />
                        </div>
                      </div>

                      <div className="account-editor-identity-copy">
                        <div className="account-editor-name-wrap">
                          <label
                            htmlFor="profile-editor-name"
                            className="sr-only"
                          >
                            Display name
                          </label>
                          <input
                            ref={nameInputRef}
                            id="profile-editor-name"
                            className="account-editor-name"
                            value={name}
                            maxLength={PROFILE_NAME_MAX}
                            autoComplete="name"
                            placeholder={handleLabel}
                            aria-required="true"
                            disabled={saving}
                            onFocus={scrollFieldIntoView}
                            onChange={(event) => setName(event.target.value)}
                            onBlur={() => {
                              const trimmed = name.trim().replace(/\s+/g, ' ');
                              if (trimmed !== name) setName(trimmed);
                            }}
                          />
                        </div>
                        <p className="profile-handle account-editor-handle">
                          @{handleLabel}
                        </p>
                        <div
                          className="account-editor-kind"
                          role="radiogroup"
                          aria-label="Account type"
                        >
                          {PROFILE_FACE_KIND_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={kind === option.value}
                              className={`os-surface-chip${
                                kind === option.value ? ' is-selected' : ''
                              }`}
                              disabled={saving}
                              onClick={() => {
                                setKind(option.value);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        {kind === 'org' && snapshot?.accountId ? (
                          <ProfileOrgMetaEditor
                            accountId={snapshot.accountId}
                            industry={industry}
                            onIndustryChange={setIndustry}
                            location={location}
                            onLocationChange={setLocation}
                            disabled={saving}
                          />
                        ) : (
                          <label
                            className="account-editor-location-row"
                            htmlFor="profile-editor-location"
                          >
                            <span className="sr-only">Location</span>
                            <PortfolioLocationMark />
                            <input
                              id="profile-editor-location"
                              className="account-editor-location"
                              value={location}
                              maxLength={PROFILE_LOCATION_MAX}
                              autoComplete="address-level2"
                              placeholder="Based in"
                              disabled={saving}
                              onFocus={scrollFieldIntoView}
                              onChange={(event) =>
                                setLocation(
                                  sanitizeProfileLocationDraft(
                                    event.target.value
                                  )
                                )
                              }
                              onBlur={() => {
                                const trimmed = location
                                  .trim()
                                  .replace(/\s+/g, ' ');
                                if (trimmed !== location) setLocation(trimmed);
                              }}
                            />
                          </label>
                        )}
                        <label htmlFor="profile-editor-bio" className="sr-only">
                          Bio
                        </label>
                        <ProfileFaceBioField
                          textareaRef={bioRef}
                          id="profile-editor-bio"
                          value={faceBio}
                          maxLength={FACE_BIO_WRAP_CHARS}
                          placeholder="Bio"
                          onFocus={scrollFieldIntoView}
                          onChange={handleFaceBioChange}
                          onBlur={() => {
                            const cleaned = faceBio.replace(/[ \t]+$/gm, '');
                            if (cleaned !== faceBio) setFaceBio(cleaned);
                          }}
                        />
                        <p className="account-editor-about-hint">
                          Short line on your page. Type @ to mention people,
                          orgs, and DAOs; # $ and links highlight like the live
                          face. Edit About separately.
                        </p>
                        <p
                          className={`account-editor-limits${
                            nameNearLimit || faceNearLimit
                              ? ' is-near-limit'
                              : ''
                          }`}
                          aria-live="polite"
                        >
                          {nameNearLimit ? (
                            <span>
                              {name.length}/{PROFILE_NAME_MAX}
                            </span>
                          ) : null}
                          {nameNearLimit ? (
                            <span
                              className="account-editor-limits-sep"
                              aria-hidden
                            >
                              ·
                            </span>
                          ) : null}
                          <span>
                            {faceBioLen}/{FACE_BIO_WRAP_CHARS}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="account-editor-form-body">
                <ProfileLinksEditor
                  links={links}
                  notes={linkNotes}
                  fieldErrors={linkFieldErrors}
                  onUpdateLink={updateLink}
                  onUpdateNote={updateNote}
                  onClearFieldError={clearLinkFieldError}
                  onSetFieldError={setLinkFieldError}
                />
                <button
                  type="button"
                  className="account-editor-about-trigger"
                  disabled={saving}
                  aria-haspopup="dialog"
                  aria-expanded={aboutOpen}
                  onClick={() => setAboutOpen(true)}
                >
                  <span className="account-editor-about-trigger-label">
                    About
                  </span>
                  <span className="account-editor-about-trigger-meta">
                    {profileAboutHasMoreThanFace({
                      faceText: faceBio,
                      aboutText: aboutBio,
                      leadText: lead,
                      photoCount: photos.length,
                      tagCount: tags.length,
                    })
                      ? [
                          lead.trim() ? 'Lead' : null,
                          tags.length > 0
                            ? `${tags.length} craft${tags.length === 1 ? '' : 's'}`
                            : null,
                          photos.length > 0
                            ? `${photos.length} photo${photos.length === 1 ? '' : 's'}`
                            : null,
                          aboutBio.trim() ? 'More bio' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Lead, crafts, photos, more'
                      : 'Lead, crafts, photos, more'}
                  </span>
                </button>
              </div>
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="account-editor-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setAvatarFile(file);
                if (file) setAvatarRemoved(false);
                event.target.value = '';
              }}
            />
            <input
              ref={bannerInputRef}
              type="file"
              accept={PROFILE_BANNER_ACCEPT}
              className="account-editor-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setBannerFile(file);
                if (file) setBannerRemoved(false);
                event.target.value = '';
              }}
            />
          </form>
        ) : loading || !loadError ? (
          <ProfileEditorLoadingSkeleton />
        ) : (
          <ProfileEditorLoadError
            message={loadError}
            onRetry={() => void loadProfile()}
          />
        )}
      </OsSlideOverScreen>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
      />
      <ProfileAboutEditorSheet
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        profileName={name}
        lead={lead}
        onLeadChange={setLead}
        aboutAlign={aboutAlign}
        onAboutAlignChange={setAboutAlign}
        aboutBio={aboutBio}
        onAboutBioChange={setAboutBio}
        tags={tags}
        onTagsChange={setTags}
        photos={photos}
        onPhotosChange={setPhotos}
        disabled={saving}
        moodId={viewerMoodId}
        moodStyle={viewerMoodStyle}
      />
    </>
  );
}
