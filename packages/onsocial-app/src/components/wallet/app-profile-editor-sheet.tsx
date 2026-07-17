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
} from '@/components/ui/os-sheet-primary-action';
import { OsNoticeCard } from '@/components/ui/os-notice-card';
import { AccountEditorChrome } from '@/components/wallet/account-editor-chrome';
import { ProfileEditorLoadError } from '@/components/wallet/profile-editor-load-error';
import { ProfileEditorLoadingSkeleton } from '@/components/wallet/profile-editor-loading-skeleton';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
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
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { nearExplorerTxHref } from '@/lib/app-config';
import {
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

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
  saving: boolean;
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
  saving,
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
  const { setTxResult } = useAppTransactionFeedback();
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const resumeFocusAfterDiscardRef = useRef(false);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const [name, setName] = useState(snapshot.name);
  const [bio, setBio] = useState(snapshot.bio);
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
    if (!editorOpen || discardConfirmOpen) {
      return;
    }

    if (resumeFocusAfterDiscardRef.current) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      nameInputRef.current?.focus({ preventScroll: true });
    }, 40);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [discardConfirmOpen, editorOpen]);

  useEffect(() => {
    if (discardConfirmOpen) {
      resumeFocusAfterDiscardRef.current = true;
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
    }

    if (!resumeFocusAfterDiscardRef.current) {
      return;
    }

    resumeFocusAfterDiscardRef.current = false;
    const restoreTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(restoreTimer);
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
        name,
        bio,
        links,
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
    ]
  );
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [dirtyRef, isDirty]);

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
  const submitLabel = snapshot.hasProfile ? 'Save' : 'Create';
  const handleLabel = fallbackLabel(accountId);
  const pageMoodId = usePageMoodId(pageAccountId, accountId, editorOpen);
  const handleHint = portfolioHandleHint(accountId, pageMoodId);
  const avatarInitial = initials(
    displayName(accountId, name.trim() || undefined)
  );
  const canSubmit =
    hasSocialSession &&
    nameReady &&
    !saving &&
    !isBootstrappingSession &&
    !hasInvalidLinks &&
    isDirty;

  const updateLink = (key: keyof ProfileLinksInput, value: string) => {
    setLinks((current) => ({
      ...current,
      [key]: value,
    }));
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
      });
      onSaved(result);
      setTxResult({
        type: 'success',
        msg: txToastSuccess.profileSaved,
        explorerHref: nearExplorerTxHref(result.txHash),
      });
      onBack();
    } catch (err) {
      if (isWalletUserCancellation(err)) {
        return;
      }
      setTxResult({ type: 'error', msg: txToastError.profileSaveFailed });
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
  };

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerRemoved(true);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = '';
    }
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
                1500&times;300 · photo or video
              </p>
            </div>

            <AccountEditorChrome
              titleId="profile-editor-title"
              title="Edit profile"
              onClose={onHeaderClose}
              className="account-editor-hero-chrome"
              closeButtonRef={closeButtonRef}
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
                    ref={nameInputRef}
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
                    }}
                    onBlur={() => {
                      const trimmed = name.trim().replace(/\s+/g, ' ');
                      if (trimmed !== name) {
                        setName(trimmed);
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
                    placeholder="Bio — use #topics, $tickers, @accounts…"
                    onFocus={scrollFieldIntoView}
                    onChange={(event) => {
                      setBio(event.target.value);
                    }}
                    onBlur={() => {
                      const trimmed = bio.trim();
                      if (trimmed !== bio) {
                        setBio(trimmed);
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

          {!hasSocialSession ? (
            <p className="account-editor-session-hint">
              {isBootstrappingSession
                ? 'Approve in your wallet…'
                : 'Resume session to save.'}
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
          <OsNoticeCard
            className="account-editor-discard-card"
            align="center"
            shell
            title="Discard changes?"
            titleId="account-editor-discard-title"
            body="Edits won’t be saved."
            bodyId="account-editor-discard-copy"
            footer={
              <div className="os-commit-actions">
                <button
                  type="button"
                  className="os-commit-cancel is-danger"
                  onClick={onDiscard}
                >
                  Discard
                </button>
                <OsSheetActions
                  layout="row-compact"
                  tone="frosted-primary"
                  borderless
                >
                  <OsSheetAction
                    ref={keepEditingRef}
                    type="button"
                    variant="primary"
                    ready
                    onClick={onKeepEditing}
                  >
                    Keep editing
                  </OsSheetAction>
                </OsSheetActions>
              </div>
            }
          />
        ) : !hasSocialSession ? (
          <div className="os-commit-actions account-editor-session-actions">
            <button
              type="button"
              className="os-commit-cancel"
              disabled={isBootstrappingSession}
              onClick={() => void connect()}
            >
              {isBootstrappingSession ? 'Resuming…' : 'Resume'}
            </button>
            <OsSheetActions layout="row-compact" tone="frosted-primary" borderless>
              <OsSheetPrimaryAction type="submit" disabled>
                {submitLabel}
              </OsSheetPrimaryAction>
            </OsSheetActions>
          </div>
        ) : (
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetPrimaryAction
              type="submit"
              ready={canSubmit}
              pending={saving}
              pendingLabel="Saving…"
              disabled={!canSubmit}
            >
              {submitLabel}
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
    loadError,
    loadProfile,
    saveProfile,
    hasSocialSession,
    isBootstrappingSession,
    connect,
    linksFromSnapshot,
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
            saving={saving}
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
        ) : loadError ? (
          <ProfileEditorLoadError
            message={loadError}
            onRetry={() => void loadProfile()}
            onClose={requestClose}
          />
        ) : (
          <ProfileEditorLoadingSkeleton onClose={requestClose} />
        )}
      </GlassSheet>
    </>
  );
}
