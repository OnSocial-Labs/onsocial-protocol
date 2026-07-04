'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
} from 'react';
import { Divider, GlassSheet, ProfileEditorMediaToolbar } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
  OsSheetPrimaryAction,
  osFloatingPanelClassName,
  osSheetFloatingPanelClassName,
} from '@/components/ui/os-sheet-primary-action';
import { AccountEditorChrome } from '@/components/wallet/account-editor-chrome';
import { ProfileEditorLoadingSkeleton } from '@/components/wallet/profile-editor-loading-skeleton';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { ProfileTagsEditor } from '@/components/wallet/profile-tags-editor';
import { usePortfolioMoodVars } from '@/hooks/use-portfolio-mood-vars';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import {
  useAppProfileEditor,
  type ProfileEditorSaveResult,
  type ProfileEditorSnapshot,
} from '@/hooks/use-app-profile-editor';
import { isProfileEditorDirty } from '@/lib/profile-editor-dirty';
import {
  displayName,
  fallbackLabel,
  initials,
  portfolioHandleHint,
} from '@/lib/profile-display';
import type { ResolvedPageHero } from '@/lib/page-data';
import { usePageMoodId } from '@/hooks/use-page-mood-id';
import {
  profileLinkEditorFieldErrors,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { normalizeProfileEditorTags } from '@/lib/profile-tag-editor';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const PROFILE_SAVE_SUCCESS_HOLD_MS = 1200;
const PROFILE_BANNER_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => {
    if (!file) {
      return null;
    }
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
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
  if (removed) {
    return null;
  }

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

interface ProfileEditorFormProps {
  accountId: string;
  pageAccountId?: string;
  editorOpen: boolean;
  snapshot: ProfileEditorSnapshot;
  linksFromSnapshot: ProfileLinksInput;
  tagsFromSnapshot: string[];
  saving: boolean;
  error: string | null;
  hasSocialSession: boolean;
  isBootstrappingSession: boolean;
  connect: () => void;
  saveProfile: ReturnType<typeof useAppProfileEditor>['saveProfile'];
  dirtyRef: MutableRefObject<boolean>;
  onSaved: (result: ProfileEditorSaveResult) => void;
  onBack: () => void;
  onHeaderClose: () => void;
  discardConfirmOpen: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}

function ProfileEditorForm({
  accountId,
  pageAccountId,
  editorOpen,
  snapshot,
  linksFromSnapshot,
  tagsFromSnapshot,
  saving,
  error,
  hasSocialSession,
  isBootstrappingSession,
  connect,
  saveProfile,
  dirtyRef,
  onSaved,
  onBack,
  onHeaderClose,
  discardConfirmOpen,
  onKeepEditing,
  onDiscard,
}: ProfileEditorFormProps) {
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(snapshot.name);
  const [bio, setBio] = useState(snapshot.bio);
  const [tags, setTags] = useState(() =>
    normalizeProfileEditorTags(snapshot.tags)
  );
  const [links, setLinks] = useState(linksFromSnapshot);
  const [linkFieldErrors, setLinkFieldErrors] = useState<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = bioRef.current;
    if (!el) {
      return;
    }

    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [bio]);

  useEffect(() => {
    if (!discardConfirmOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      keepEditingRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onKeepEditing();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [discardConfirmOpen, onKeepEditing]);

  const avatarPreview = useObjectUrl(avatarFile);
  const bannerPreview = useObjectUrl(bannerFile);
  const displayAvatarUrl = avatarRemoved
    ? null
    : (avatarPreview ?? snapshot.avatarUrl);
  const displayBannerMedia = resolveBannerPreviewMedia(
    bannerFile,
    bannerPreview,
    snapshot,
    bannerRemoved
  );

  const isDirty = useMemo(
    () =>
      isProfileEditorDirty({
        snapshot,
        linksFromSnapshot,
        tagsFromSnapshot,
        name,
        bio,
        links,
        tags,
        avatarFile,
        bannerFile,
        avatarRemoved,
        bannerRemoved,
      }),
    [
      avatarFile,
      avatarRemoved,
      bannerFile,
      bannerRemoved,
      bio,
      links,
      linksFromSnapshot,
      name,
      snapshot,
      tags,
      tagsFromSnapshot,
    ]
  );
  useEffect(() => {
    dirtyRef.current = saved ? false : isDirty;
  }, [dirtyRef, isDirty, saved]);

  const nameReady = name.trim().length > 0;
  const hasInvalidLinks = useMemo(
    () =>
      Object.keys(profileLinkEditorFieldErrors(links)).length > 0 ||
      Object.keys(linkFieldErrors).length > 0,
    [linkFieldErrors, links]
  );
  const hasCurrentLinks = Boolean(
    snapshot.links && Object.keys(snapshot.links).length > 0
  );
  const hasLinkInput = Object.values(links).some((value) => value.trim());
  const submitLabel = snapshot.hasProfile ? 'Save profile' : 'Create profile';
  const handleLabel = fallbackLabel(accountId);
  const pageMoodId = usePageMoodId(pageAccountId, accountId, editorOpen);
  const handleHint = portfolioHandleHint(accountId, pageMoodId);
  const avatarInitial = initials(
    displayName(accountId, name.trim() || undefined)
  );

  const markDirty = () => {
    setSaved(false);
  };

  const updateLink = (key: keyof ProfileLinksInput, value: string) => {
    setLinks((current) => ({
      ...current,
      [key]: value,
    }));
    markDirty();
  };

  const clearLinkFieldError = (key: keyof ProfileLinksInput) => {
    setLinkFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }

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
        if (!current[key]) {
          return current;
        }

        const next = { ...current };
        delete next[key];
        return next;
      }

      if (current[key] === message) {
        return current;
      }

      return { ...current, [key]: message };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nameReady || saving || !hasSocialSession) {
      if (!hasSocialSession) {
        void connect();
      }
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
        bio,
        avatar: avatarFile,
        banner: bannerFile,
        removeAvatar: avatarRemoved,
        removeBanner: bannerRemoved,
        links,
        currentLinks: snapshot.links,
        hasCurrentLinks,
        hasLinkInput,
        tags,
        currentTags: tagsFromSnapshot,
      });
      setSaved(true);
      onSaved(result);
      await new Promise((resolve) =>
        window.setTimeout(resolve, PROFILE_SAVE_SUCCESS_HOLD_MS)
      );
      onBack();
    } catch (err) {
      if (isWalletUserCancellation(err)) {
        return;
      }
      setSaved(false);
      const validationErrors = profileLinkEditorFieldErrors(links);
      if (Object.keys(validationErrors).length > 0) {
        setLinkFieldErrors(validationErrors);
      }
    }
  };

  const openBannerPicker = () => {
    bannerInputRef.current?.click();
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarRemoved(true);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
    markDirty();
  };

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerRemoved(true);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = '';
    }
    markDirty();
  };

  return (
    <form
      className={`account-editor-form${discardConfirmOpen ? ' is-discard-confirm' : ''}`}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="account-editor-form-main">
        <section className="account-editor-hero" aria-label="Profile">
          <div
            className={`account-editor-cover-stage${displayBannerMedia ? ' has-media' : ''}`}
          >
            <div className="account-editor-banner-wrap profile-editor-media-banner-dock">
              <div
                className={`account-editor-banner-button profile-editor-media-host${displayBannerMedia ? ' has-media' : ''}`}
              >
                <button
                  type="button"
                  className="profile-editor-media-backdrop account-editor-banner-backdrop"
                  onClick={openBannerPicker}
                  aria-label="Choose banner"
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
                    <span className="account-editor-banner-empty" aria-hidden />
                  )}
                  <span
                    className={`account-editor-banner-overlay${displayBannerMedia ? ' has-media' : ''}`}
                    aria-hidden
                  />
                </button>
                <ProfileEditorMediaToolbar
                  layout="banner"
                  removeLabel={displayBannerMedia ? 'Remove banner' : undefined}
                  onRemove={displayBannerMedia ? handleRemoveBanner : undefined}
                />
              </div>
              <p
                className="profile-editor-media-size-hint profile-editor-media-size-hint--dock"
                aria-hidden
              >
                1500&times;300 image or short MP4/WebM video
              </p>
            </div>

            <AccountEditorChrome
              titleId="profile-editor-title"
              title="Edit profile"
              onClose={onHeaderClose}
              className="account-editor-hero-chrome"
            />

            <div className="account-editor-hero-overlap">
              <div className="account-editor-identity">
                <div className="account-editor-avatar-wrap">
                  <div
                    className={`account-editor-avatar profile-editor-media-host profile-editor-media-host--avatar${displayAvatarUrl ? ' has-media' : ''}`}
                  >
                    <button
                      type="button"
                      className="profile-editor-media-backdrop account-editor-avatar-backdrop"
                      onClick={() => avatarInputRef.current?.click()}
                      aria-label="Choose avatar"
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
                        className={`profile-editor-media-overlay account-editor-avatar-overlay${displayAvatarUrl ? ' has-media' : ''}`}
                        aria-hidden
                      />
                    </button>
                    <ProfileEditorMediaToolbar
                      layout="avatar"
                      removeLabel={
                        displayAvatarUrl ? 'Remove avatar' : undefined
                      }
                      onRemove={
                        displayAvatarUrl ? handleRemoveAvatar : undefined
                      }
                    />
                  </div>
                </div>

                <div className="account-editor-identity-copy">
                  <label htmlFor="profile-editor-name" className="sr-only">
                    Display name
                  </label>
                  <input
                    id="profile-editor-name"
                    className="account-editor-name"
                    value={name}
                    maxLength={50}
                    autoComplete="name"
                    placeholder={handleLabel}
                    aria-required="true"
                    onFocus={scrollFieldIntoView}
                    onChange={(event) => {
                      setName(event.target.value);
                      markDirty();
                    }}
                    onBlur={() => {
                      const trimmed = name.trim().replace(/\s+/g, ' ');
                      if (trimmed !== name) {
                        setName(trimmed);
                        markDirty();
                      }
                    }}
                  />
                  <p className="profile-handle account-editor-handle">
                    @{handleLabel}
                  </p>
                  {handleHint ? (
                    <p className="account-editor-handle-hint">{handleHint}</p>
                  ) : null}
                  <label htmlFor="profile-editor-bio" className="sr-only">
                    Bio
                  </label>
                  <textarea
                    ref={bioRef}
                    id="profile-editor-bio"
                    className="account-editor-bio"
                    value={bio}
                    maxLength={180}
                    rows={1}
                    placeholder="Add a short bio…"
                    onFocus={scrollFieldIntoView}
                    onChange={(event) => {
                      setBio(event.target.value);
                      markDirty();
                    }}
                    onBlur={() => {
                      const trimmed = bio.trim();
                      if (trimmed !== bio) {
                        setBio(trimmed);
                        markDirty();
                      }
                    }}
                  />
                  <p className="account-editor-limits" aria-live="polite">
                    <span>{name.length}/50</span>
                    <span className="account-editor-limits-sep" aria-hidden>
                      ·
                    </span>
                    <span>{bio.trim().length}/180</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="account-editor-form-body">
          <Divider
            variant="section"
            className="account-editor-section-divider"
          />

          <ProfileLinksEditor
            links={links}
            fieldErrors={linkFieldErrors}
            onUpdateLink={updateLink}
            onClearFieldError={clearLinkFieldError}
            onSetFieldError={setLinkFieldError}
          />

          <ProfileTagsEditor
            tags={tags}
            onChange={(next) => {
              setTags(next);
              markDirty();
            }}
          />

          {!hasSocialSession ? (
            <p className="account-editor-session-hint">
              {isBootstrappingSession
                ? 'Approve the OnSocial session in your wallet to save.'
                : 'Resume your session to save profile changes.'}
            </p>
          ) : null}

          {error ? (
            <p className="account-editor-error-card" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={`account-editor-footer${discardConfirmOpen ? ' is-discard-confirm' : ''}`}
        role={discardConfirmOpen ? 'alertdialog' : undefined}
        aria-modal={discardConfirmOpen || undefined}
        aria-labelledby={
          discardConfirmOpen ? 'account-editor-discard-title' : undefined
        }
        aria-describedby={
          discardConfirmOpen ? 'account-editor-discard-copy' : undefined
        }
      >
        {discardConfirmOpen ? (
          <div
            className={`${osFloatingPanelClassName} ${osSheetFloatingPanelClassName} account-editor-discard-card`}
          >
            <div className="account-editor-discard-footer-copy">
              <p
                id="account-editor-discard-title"
                className="account-editor-discard-title"
              >
                Discard changes?
              </p>
              <p
                id="account-editor-discard-copy"
                className="account-editor-discard-copy"
              >
                Your edits won&apos;t be saved.
              </p>
            </div>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                ref={keepEditingRef}
                type="button"
                variant="primary"
                onClick={onKeepEditing}
              >
                Keep editing
              </OsSheetAction>
              <OsSheetAction type="button" variant="danger" onClick={onDiscard}>
                Discard
              </OsSheetAction>
            </OsSheetActions>
          </div>
        ) : (
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetPrimaryAction
              type="submit"
              ready={isDirty && !saved && hasSocialSession}
              succeeded={saved}
              succeededLabel="Saved"
              pending={saving}
              pendingLabel="Saving…"
              disabled={
                saved ||
                !nameReady ||
                saving ||
                isBootstrappingSession ||
                (hasSocialSession && (hasInvalidLinks || !isDirty))
              }
            >
              {!hasSocialSession ? 'Resume session to save' : submitLabel}
            </OsSheetPrimaryAction>
          </OsSheetActions>
        )}
      </div>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="account-editor-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          setAvatarFile(file);
          if (file) {
            setAvatarRemoved(false);
          }
          markDirty();
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
          if (file) {
            setBannerRemoved(false);
          }
          markDirty();
          event.target.value = '';
        }}
      />
    </form>
  );
}

interface AppProfileEditorSheetProps {
  open: boolean;
  sessionKey: number;
  accountId: string;
  pageAccountId?: string;
  onBack: () => void;
  onClose: () => void;
  onSaved: (result: ProfileEditorSaveResult) => void;
}

type LeaveAction = 'back' | 'close';

/** Nested full sheet — edit profile without leaving the OS account drawer stack. */
export function AppProfileEditorSheet({
  open,
  sessionKey,
  accountId,
  pageAccountId,
  onBack,
  onClose,
  onSaved,
}: AppProfileEditorSheetProps) {
  const [closing, setClosing] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirtyRef = useRef(false);
  const pendingLeaveRef = useRef<LeaveAction | null>(null);

  const sheetOpen = open && !closing;
  const {
    snapshot,
    loading,
    saving,
    error,
    saveProfile,
    hasSocialSession,
    isBootstrappingSession,
    connect,
    linksFromSnapshot,
    tagsFromSnapshot,
  } = useAppProfileEditor(accountId, sheetOpen);
  const { moodId: portfolioMoodId, style: portfolioMoodStyle } =
    usePortfolioMoodVars(pageAccountId, accountId, sheetOpen);
  const pageMoodPanelClass = portfolioMoodId
    ? ' account-editor-panel--page-mood'
    : '';

  useScrollLock(open || closing);

  const completeLeave = (action: LeaveAction) => {
    pendingLeaveRef.current = null;
    setDiscardOpen(false);

    if (action === 'back') {
      onBack();
      return;
    }

    setClosing(true);
  };

  const tryLeave = (action: LeaveAction) => {
    if (dirtyRef.current && !saving) {
      pendingLeaveRef.current = action;
      setDiscardOpen(true);
      return;
    }

    completeLeave(action);
  };

  const requestClose = () => {
    if (discardOpen) {
      pendingLeaveRef.current = null;
      setDiscardOpen(false);
      return;
    }

    tryLeave('close');
  };

  const handleSheetClosed = () => {
    setClosing(false);
    setDiscardOpen(false);
    pendingLeaveRef.current = null;
    onClose();
  };

  const handleDiscard = () => {
    const action = pendingLeaveRef.current ?? 'close';
    completeLeave(action);
  };

  return (
    <>
      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        tone="os"
        initialDetent="full"
        zIndex={56}
        presentation="swap"
        ariaLabelledBy="profile-editor-title"
        backdropLabel="Close editor"
        panelClassName={`account-editor-panel${pageMoodPanelClass}${portfolioMoodId ? ` account-editor-panel--${portfolioMoodId}` : ''}`}
        panelStyle={portfolioMoodStyle}
        bodyClassName="account-editor-body"
      >
        {loading && !snapshot ? (
          <ProfileEditorLoadingSkeleton onClose={requestClose} />
        ) : snapshot ? (
          <ProfileEditorForm
            key={sessionKey}
            accountId={accountId}
            pageAccountId={pageAccountId}
            editorOpen={sheetOpen}
            snapshot={snapshot}
            linksFromSnapshot={linksFromSnapshot}
            tagsFromSnapshot={tagsFromSnapshot}
            saving={saving}
            error={error}
            hasSocialSession={hasSocialSession}
            isBootstrappingSession={isBootstrappingSession}
            connect={() => void connect()}
            saveProfile={saveProfile}
            dirtyRef={dirtyRef}
            onSaved={onSaved}
            onBack={() => completeLeave('back')}
            onHeaderClose={requestClose}
            discardConfirmOpen={discardOpen}
            onKeepEditing={() => {
              pendingLeaveRef.current = null;
              setDiscardOpen(false);
            }}
            onDiscard={handleDiscard}
          />
        ) : null}
      </GlassSheet>
    </>
  );
}
