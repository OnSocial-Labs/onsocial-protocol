'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  PROFILE_FACE_KIND_OPTIONS,
  PROFILE_INDUSTRY_MAX,
  PROFILE_LOCATION_MAX,
  editorFaceKind,
  isProfileIndustryWriteIn,
  isProfileIndustryWriteInMode,
  matchProfileIndustryOption,
  normalizeProfileIndustryInput,
  normalizeProfileLocationInput,
  profileAvatarShapeFromKind,
  profileIndustryChoiceOptions,
  profileIndustryDrawerValue,
  profileIndustryFromMaterialised,
  profileKindFromMaterialised,
  profileLocationFromMaterialised,
  sanitizeProfileIndustryDraft,
  sanitizeProfileLocationDraft,
  type MaterialisedProfile,
  type ProfileKind,
} from '@onsocial/sdk';
import {
  BuildingTreeIcon,
  ChoiceDrawer,
  OsSheetAction,
  OsSheetActions,
  ProfileEditorMediaToolbar,
  type ChoiceOption,
} from '@onsocial/ui';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ProfileLinkFieldIcon } from '@/components/profile-link-icons';
import {
  TransactionFeedbackToast,
  type TransactionFeedback,
} from '@/components/ui/transaction-feedback-toast';
import {
  profileIdentityAvatarDockClass,
  profileIdentityAvatarSizeClass,
  profileIdentityLayoutClass,
  profileIdentityOverlapClass,
  profileIdentityTextClass,
} from '@/features/profile/profile-identity-loading';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import type {
  ProfileSaveInput,
  ProfileSaveResult,
} from '@/contexts/profile-context';
import {
  formatProfileLinkForEditor,
  normalizeProfileLinksInput,
  PROFILE_LINK_EDITOR_FIELDS,
  profileLinkEditorFieldErrors,
  profileLinkEditorInlineError,
  profileLinksInputFromRecord,
  sanitizeOnSocialLinkInput,
  type ProfileLinkKind,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  reportWalletActionFailure,
  isWalletUserCancellation,
  isWalletCancellationMessage,
} from '@/lib/wallet-errors';
import { cn } from '@/lib/utils';
import { ProfileJobsEditor } from '@/components/profile-jobs-editor';

/** Same-origin server probe — mirrors app `probeNearAccountExists`. */
async function probeNearAccountExists(accountId: string): Promise<boolean> {
  const response = await fetch(
    `/api/account-exists?accountId=${encodeURIComponent(accountId)}`,
    { headers: { accept: 'application/json' } }
  );
  if (!response.ok) {
    throw new Error(`account-exists probe failed (${response.status})`);
  }
  const data = (await response.json()) as {
    exists?: unknown;
    uncertain?: unknown;
  };
  if (data.uncertain === true) {
    throw new Error('Could not verify account');
  }
  return data.exists === true;
}

interface ProfileEditorProps {
  open: boolean;
  accountId: string | null;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  isSaving?: boolean;
  isAuthorizingSession?: boolean;
  hasSocialSession?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: ProfileSaveInput) => Promise<ProfileSaveResult>;
}

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

function getInitialName(profile: MaterialisedProfile | null): string {
  return profile?.name ?? '';
}

function getInitialBio(profile: MaterialisedProfile | null): string {
  return profile?.bio ?? '';
}

function getInitialLocation(profile: MaterialisedProfile | null): string {
  return profileLocationFromMaterialised(profile);
}

function getInitialIndustry(profile: MaterialisedProfile | null): string {
  return profileIndustryFromMaterialised(profile);
}

function getInitialKind(profile: MaterialisedProfile | null): ProfileKind {
  return editorFaceKind(profileKindFromMaterialised(profile));
}

const PROFILE_INDUSTRY_CHOICES: ChoiceOption<string>[] =
  profileIndustryChoiceOptions();
const PORTAL_INDUSTRY_DRAWER_Z = 2147483647;

export function ProfileEditor({
  open,
  accountId,
  profile,
  avatarUrl,
  bannerUrl,
  isSaving = false,
  isAuthorizingSession = false,
  hasSocialSession = false,
  error,
  onOpenChange,
  onSave,
}: ProfileEditorProps) {
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const industryInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(getInitialName(profile));
  const [location, setLocation] = useState(getInitialLocation(profile));
  const [industry, setIndustry] = useState(getInitialIndustry(profile));
  const [industryWriteIn, setIndustryWriteIn] = useState(() =>
    isProfileIndustryWriteInMode(getInitialIndustry(profile))
  );
  const [industryDrawerOpen, setIndustryDrawerOpen] = useState(false);
  const [kind, setKind] = useState<ProfileKind>(() => getInitialKind(profile));
  const [bio, setBio] = useState(getInitialBio(profile));
  const [links, setLinks] = useState<ProfileLinksInput>(() =>
    profileLinksInputFromRecord(profile?.links)
  );
  const [avatar, setAvatar] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [actionToast, setActionToast] = useState<TransactionFeedback | null>(
    null
  );
  const [linkFieldErrors, setLinkFieldErrors] = useState<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const [probingLinkKey, setProbingLinkKey] = useState<
    keyof ProfileLinksInput | null
  >(null);
  const linkProbeGenRef = useRef(0);
  const [saved, setSaved] = useState(false);
  const previewUrl = useObjectUrl(avatar);
  const bannerPreviewUrl = useObjectUrl(banner);
  const displayAvatarUrl = avatarRemoved ? null : (previewUrl ?? avatarUrl);
  const displayBannerUrl = bannerRemoved
    ? null
    : (bannerPreviewUrl ?? bannerUrl);
  const submitLabel = profile ? 'Save profile' : 'Create profile';
  const nameReady = name.trim().length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open, scrollRef);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onOpenChange, open]);

  const characterCount = bio.trim().length;
  const initialLinks = useMemo(
    () => profileLinksInputFromRecord(profile?.links),
    [profile?.links]
  );
  const isDirty = useMemo(() => {
    if (avatar || banner) {
      return true;
    }
    if (avatarRemoved && avatarUrl) {
      return true;
    }
    if (bannerRemoved && bannerUrl) {
      return true;
    }
    if (name.trim() !== getInitialName(profile).trim()) {
      return true;
    }
    if (
      normalizeProfileLocationInput(location) !== getInitialLocation(profile)
    ) {
      return true;
    }
    if (kind !== getInitialKind(profile)) {
      return true;
    }
    if (
      (kind === 'org' ? normalizeProfileIndustryInput(industry) : '') !==
      (getInitialKind(profile) === 'org' ? getInitialIndustry(profile) : '')
    ) {
      return true;
    }
    if (bio.trim() !== getInitialBio(profile).trim()) {
      return true;
    }
    for (const field of PROFILE_LINK_EDITOR_FIELDS) {
      if (links[field.key].trim() !== initialLinks[field.key].trim()) {
        return true;
      }
    }
    return false;
  }, [
    avatar,
    avatarRemoved,
    avatarUrl,
    banner,
    bannerRemoved,
    bannerUrl,
    bio,
    initialLinks,
    industry,
    kind,
    links,
    location,
    name,
    profile,
  ]);
  const hasCurrentLinks = Boolean(
    profile?.links && Object.keys(profile.links).length > 0
  );
  const hasLinkInput = Object.values(links).some((value) => value.trim());
  const markDirty = () => {
    if (saved) setSaved(false);
  };

  const updateLink = (key: keyof ProfileLinksInput, value: string) => {
    const nextValue =
      key === 'onsocial' ? sanitizeOnSocialLinkInput(value) : value;
    setLinks((current) => ({ ...current, [key]: nextValue }));
    if (linkFieldErrors[key]) {
      setLinkFieldErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
    markDirty();
  };

  const commitLinkField = async (
    key: keyof ProfileLinksInput,
    kind: ProfileLinkKind
  ) => {
    if (probingLinkKey === key) return;

    const result = formatProfileLinkForEditor(links[key], kind);

    if (result.error) {
      setLinkFieldErrors((current) => ({ ...current, [key]: result.error! }));
      return;
    }

    if (result.value !== links[key]) {
      setLinks((current) => ({ ...current, [key]: result.value }));
    }

    if (kind === 'onsocial' && result.value.trim()) {
      const gen = ++linkProbeGenRef.current;
      setProbingLinkKey(key);
      try {
        const exists = await probeNearAccountExists(result.value);
        if (gen !== linkProbeGenRef.current) return;
        if (!exists) {
          setLinkFieldErrors((current) => ({
            ...current,
            [key]: 'Account not found on this network',
          }));
          return;
        }
      } catch {
        if (gen !== linkProbeGenRef.current) return;
        setLinkFieldErrors((current) => ({
          ...current,
          [key]: 'Could not verify account',
        }));
        return;
      } finally {
        if (gen === linkProbeGenRef.current) {
          setProbingLinkKey(null);
        }
      }
    }

    setLinkFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nameReady || isSaving) return;

    setActionToast(null);
    try {
      const validationErrors = profileLinkEditorFieldErrors(links);
      if (Object.keys(validationErrors).length > 0) {
        setLinkFieldErrors(validationErrors);
        const firstError = Object.values(validationErrors)[0];
        throw new Error(firstError ?? 'Fix invalid profile links');
      }

      const normalizedLinks = normalizeProfileLinksInput(links, profile?.links);
      if (normalizedLinks.onsocial) {
        const exists = await probeNearAccountExists(normalizedLinks.onsocial);
        if (!exists) {
          setLinkFieldErrors((current) => ({
            ...current,
            onsocial: 'Account not found on this network',
          }));
          throw new Error(
            'OnSocial link account was not found on this network'
          );
        }
      }

      const shouldSaveLinks =
        hasCurrentLinks ||
        hasLinkInput ||
        Object.keys(normalizedLinks).length > 0;

      await onSave({
        name,
        location: normalizeProfileLocationInput(location) || null,
        industry:
          kind === 'org'
            ? normalizeProfileIndustryInput(industry) || null
            : null,
        kind: kind === 'org' ? 'org' : null,
        bio,
        avatar: avatarRemoved ? null : (avatar ?? undefined),
        banner: bannerRemoved ? null : (banner ?? undefined),
        ...(shouldSaveLinks ? { links: normalizedLinks } : {}),
      });
      setLinkFieldErrors({});
      setSaved(true);
    } catch (err) {
      setSaved(false);
      if (isWalletUserCancellation(err)) return;
      reportWalletActionFailure(err, (msg) =>
        setActionToast({ type: 'error', msg })
      );
    }
  };

  const openBannerPicker = () => {
    bannerInputRef.current?.click();
  };

  const handleRemoveAvatar = () => {
    setAvatar(null);
    setAvatarRemoved(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    markDirty();
  };

  const handleRemoveBanner = () => {
    setBanner(null);
    setBannerRemoved(true);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = '';
    }
    markDirty();
  };

  if (typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              {...fadeMotion(reduceMotion ? 0 : 0.18)}
              data-lenis-prevent
              className="fixed inset-0 z-[2147483646] flex items-center justify-center px-4 py-6"
            >
              <button
                type="button"
                className="absolute inset-0 bg-background/72 backdrop-blur-md"
                aria-label="Close profile editor"
                disabled={isSaving}
                onClick={() => onOpenChange(false)}
              />

              <motion.form
                {...scaleFadeMotion(!!reduceMotion, {
                  y: 14,
                  scale: 0.98,
                  duration: 0.22,
                  exitY: 10,
                  exitScale: 0.99,
                })}
                onSubmit={handleSubmit}
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-name"
                className={cn(
                  'relative flex h-[min(760px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
                  portalElevatedShadowClass
                )}
              >
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
                  <ModalCloseButton
                    ariaLabel="Close profile editor"
                    onClick={() => onOpenChange(false)}
                    disabled={isSaving}
                    className="border-white/18 bg-black/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_-20px_rgba(0,0,0,0.56)] backdrop-blur-xl backdrop-saturate-150 hover:border-white/28 hover:bg-black/30 hover:text-white"
                  />
                </div>

                <div
                  ref={scrollRef}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                >
                  <section className="pb-2">
                    <div className="profile-editor-media-banner-dock">
                      <div
                        className={`profile-editor-media-host profile-editor-media-host--banner aspect-[5/1] w-full${displayBannerUrl ? ' has-media' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={openBannerPicker}
                          className="profile-editor-media-backdrop relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden bg-background text-muted-foreground"
                          aria-label="Choose profile banner"
                        >
                          {!displayBannerUrl ? (
                            <span
                              aria-hidden
                              className="profile-editor-media-empty-fill"
                            />
                          ) : null}
                          {displayBannerUrl ? (
                            <img
                              src={displayBannerUrl}
                              alt=""
                              className="relative h-full w-full object-cover"
                            />
                          ) : null}
                          <span
                            className={`profile-editor-media-overlay${displayBannerUrl ? ' has-media' : ''}`}
                            aria-hidden
                          />
                        </button>
                        <ProfileEditorMediaToolbar
                          layout="banner"
                          removeLabel={
                            displayBannerUrl ? 'Remove banner' : undefined
                          }
                          onRemove={
                            displayBannerUrl ? handleRemoveBanner : undefined
                          }
                        />
                      </div>
                      <p className="profile-editor-media-size-hint profile-editor-media-size-hint--dock">
                        1500&times;300
                      </p>
                    </div>

                    <div
                      className={cn(
                        'relative z-10 space-y-3 pb-2 pointer-events-none',
                        profileIdentityLayoutClass,
                        profileIdentityOverlapClass,
                        'px-4 md:px-5'
                      )}
                    >
                      <div className="space-y-2 pr-8">
                        <div className="flex items-start gap-3.5">
                          <div
                            className={cn(
                              profileIdentityAvatarDockClass,
                              'pointer-events-auto'
                            )}
                          >
                            <div
                              className={cn(
                                'profile-editor-media-host profile-editor-media-host--avatar',
                                profileAvatarShapeFromKind(kind) !== 'circle' &&
                                  'profile-editor-media-host--squircle',
                                profileIdentityAvatarSizeClass,
                                displayAvatarUrl && 'has-media'
                              )}
                              data-profile-kind={kind}
                            >
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                  'profile-editor-media-backdrop relative flex cursor-pointer items-center justify-center overflow-hidden !border-[3px] !border-background bg-background text-muted-foreground shadow-lg',
                                  profileIdentityAvatarSizeClass,
                                  kind === 'person' && 'rounded-full',
                                  kind === 'org' && 'rounded-2xl',
                                  kind === 'dao' && 'rounded-[1rem]'
                                )}
                                aria-label="Choose avatar"
                              >
                                {!displayAvatarUrl ? (
                                  <span
                                    aria-hidden
                                    className={cn(
                                      'profile-editor-media-empty-fill',
                                      kind === 'person' && 'rounded-full',
                                      kind === 'org' && 'rounded-[13px]',
                                      kind === 'dao' && 'rounded-[0.85rem]'
                                    )}
                                  />
                                ) : null}
                                {displayAvatarUrl ? (
                                  <img
                                    src={displayAvatarUrl}
                                    alt=""
                                    className="relative h-full w-full object-cover"
                                  />
                                ) : null}
                                <span
                                  className={cn(
                                    'profile-editor-media-overlay',
                                    kind === 'person' && 'rounded-full',
                                    kind === 'org' && 'rounded-[13px]',
                                    kind === 'dao' && 'rounded-[0.85rem]',
                                    displayAvatarUrl && 'has-media'
                                  )}
                                  aria-hidden
                                />
                              </button>
                              <ProfileEditorMediaToolbar
                                layout="avatar"
                                removeLabel={
                                  displayAvatarUrl ? 'Remove avatar' : undefined
                                }
                                onRemove={
                                  displayAvatarUrl
                                    ? handleRemoveAvatar
                                    : undefined
                                }
                              />
                            </div>
                            <span className="portal-type-micro tabular-nums leading-none text-muted-foreground/45">
                              512&times;512
                            </span>
                          </div>
                        </div>

                        <div
                          className={cn(
                            profileIdentityTextClass,
                            'pointer-events-auto'
                          )}
                        >
                          <label htmlFor="profile-name" className="sr-only">
                            Display name
                          </label>
                          <input
                            id="profile-name"
                            value={name}
                            onChange={(event) => {
                              setName(event.target.value);
                              markDirty();
                            }}
                            maxLength={50}
                            autoComplete="name"
                            className="w-full bg-transparent font-semibold text-foreground portal-type-display outline-none"
                            aria-required="true"
                          />
                          <p className="min-w-0 truncate portal-type-body-sm text-muted-foreground/55">
                            {accountId ? `@${accountId}` : 'Wallet'}
                          </p>
                          <div
                            className="flex flex-wrap gap-1.5 pt-1"
                            role="radiogroup"
                            aria-label="Account type"
                          >
                            {PROFILE_FACE_KIND_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={kind === option.value}
                                disabled={isSaving}
                                onClick={() => {
                                  setKind(option.value);
                                  if (option.value !== 'org') {
                                    setIndustryWriteIn(false);
                                    setIndustryDrawerOpen(false);
                                  }
                                  markDirty();
                                }}
                                className={cn(
                                  'rounded-full px-2.5 py-1 portal-type-caption transition-colors',
                                  kind === option.value
                                    ? 'bg-foreground/10 text-foreground'
                                    : 'text-muted-foreground/70 hover:bg-foreground/5'
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          {kind === 'org' ? (
                            <>
                              {industryWriteIn ? (
                                <label
                                  htmlFor="profile-industry"
                                  className="mt-1 flex items-center gap-1.5"
                                >
                                  <span className="sr-only">Industry</span>
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    aria-label="Choose industry"
                                    className="shrink-0 text-muted-foreground/55"
                                    onClick={() => setIndustryDrawerOpen(true)}
                                  >
                                    <BuildingTreeIcon
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                  </button>
                                  <input
                                    ref={industryInputRef}
                                    id="profile-industry"
                                    value={industry}
                                    onChange={(event) => {
                                      setIndustry(
                                        sanitizeProfileIndustryDraft(
                                          event.target.value
                                        )
                                      );
                                      markDirty();
                                    }}
                                    onBlur={() => {
                                      const trimmed =
                                        normalizeProfileIndustryInput(industry);
                                      if (trimmed !== industry)
                                        setIndustry(trimmed);
                                      if (
                                        !trimmed ||
                                        matchProfileIndustryOption(trimmed)
                                      ) {
                                        setIndustryWriteIn(false);
                                      }
                                    }}
                                    maxLength={PROFILE_INDUSTRY_MAX}
                                    autoComplete="organization-title"
                                    placeholder="Industry"
                                    className="w-full bg-transparent portal-type-body-sm text-muted-foreground/70 outline-none placeholder:text-muted-foreground/35"
                                  />
                                </label>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  aria-haspopup="dialog"
                                  aria-expanded={industryDrawerOpen}
                                  className="mt-1 flex w-full items-center gap-1.5 text-left"
                                  onClick={() => setIndustryDrawerOpen(true)}
                                >
                                  <BuildingTreeIcon
                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/55"
                                    aria-hidden
                                  />
                                  <span
                                    className={`portal-type-body-sm ${
                                      industry
                                        ? 'text-muted-foreground/70'
                                        : 'text-muted-foreground/35'
                                    }`}
                                  >
                                    {industry || 'Industry'}
                                  </span>
                                </button>
                              )}
                              <ChoiceDrawer
                                open={industryDrawerOpen}
                                onClose={() => setIndustryDrawerOpen(false)}
                                label="Industry"
                                copy="Optional. Skip to stay Organization."
                                value={profileIndustryDrawerValue(industry)}
                                options={PROFILE_INDUSTRY_CHOICES}
                                onChange={(next) => {
                                  if (isProfileIndustryWriteIn(next)) {
                                    setIndustryWriteIn(true);
                                    if (matchProfileIndustryOption(industry)) {
                                      setIndustry('');
                                    }
                                    markDirty();
                                    window.setTimeout(
                                      () => industryInputRef.current?.focus(),
                                      0
                                    );
                                    return;
                                  }
                                  setIndustryWriteIn(false);
                                  setIndustry(next);
                                  markDirty();
                                }}
                                zIndex={PORTAL_INDUSTRY_DRAWER_Z}
                              />
                              {accountId ? (
                                <ProfileJobsEditor
                                  accountId={accountId}
                                  disabled={isSaving || isAuthorizingSession}
                                  onToast={setActionToast}
                                />
                              ) : null}
                            </>
                          ) : null}
                          <label htmlFor="profile-location" className="sr-only">
                            Location
                          </label>
                          <input
                            id="profile-location"
                            value={location}
                            onChange={(event) => {
                              setLocation(
                                sanitizeProfileLocationDraft(event.target.value)
                              );
                              markDirty();
                            }}
                            onBlur={() => {
                              const trimmed =
                                normalizeProfileLocationInput(location);
                              if (trimmed !== location) setLocation(trimmed);
                            }}
                            maxLength={PROFILE_LOCATION_MAX}
                            autoComplete="address-level2"
                            placeholder="Based in"
                            className="w-full bg-transparent portal-type-body-sm text-muted-foreground/70 outline-none placeholder:text-muted-foreground/35"
                          />
                          <p className="portal-type-caption tabular-nums text-muted-foreground/45">
                            {name.length}/50
                          </p>
                        </div>
                      </div>

                      <div className="pointer-events-auto">
                        <label htmlFor="profile-bio" className="sr-only">
                          Bio
                        </label>
                        <textarea
                          id="profile-bio"
                          value={bio}
                          onChange={(event) => {
                            setBio(event.target.value);
                            markDirty();
                          }}
                          maxLength={160}
                          rows={2}
                          placeholder="Bio — use #topics, $tickers, @accounts…"
                          className="w-full resize-none bg-transparent portal-type-body leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/40"
                        />
                        <p className="mt-0.5 portal-type-caption tabular-nums text-muted-foreground/45">
                          {characterCount}/160
                        </p>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        setAvatar(event.target.files?.[0] ?? null);
                        setAvatarRemoved(false);
                        markDirty();
                        event.target.value = '';
                      }}
                    />
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        setBanner(event.target.files?.[0] ?? null);
                        setBannerRemoved(false);
                        markDirty();
                        event.target.value = '';
                      }}
                    />
                  </section>

                  <div className="space-y-3 px-4 py-3 md:px-5">
                    <div className="grid grid-cols-2 gap-2.5">
                      {PROFILE_LINK_EDITOR_FIELDS.map((field) => (
                        <div
                          key={field.key}
                          className={cn(
                            'col-span-1 space-y-1',
                            field.fullWidth && 'col-span-2'
                          )}
                        >
                          <div
                            className={cn(
                              'portal-field-focus flex items-center rounded-2xl border border-border/40 bg-background/45',
                              linkFieldErrors[field.key] &&
                                'border-[var(--portal-red-border)]'
                            )}
                          >
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center border-r border-border/60 text-muted-foreground"
                              aria-hidden
                            >
                              <ProfileLinkFieldIcon kind={field.kind} />
                            </span>
                            <input
                              id={`profile-${field.key}`}
                              value={links[field.key]}
                              onChange={(event) =>
                                updateLink(field.key, event.target.value)
                              }
                              onBlur={() => {
                                void commitLinkField(field.key, field.kind);
                              }}
                              disabled={probingLinkKey === field.key}
                              aria-busy={
                                probingLinkKey === field.key || undefined
                              }
                              maxLength={
                                field.kind === 'website' ||
                                field.kind === 'onsocial'
                                  ? 255
                                  : 80
                              }
                              inputMode={
                                field.kind === 'website' ||
                                field.kind === 'onsocial'
                                  ? 'url'
                                  : undefined
                              }
                              autoComplete={
                                field.kind === 'website' ? 'url' : 'off'
                              }
                              autoCapitalize={
                                field.kind === 'onsocial' ? 'none' : undefined
                              }
                              autoCorrect={
                                field.kind === 'onsocial' ? 'off' : undefined
                              }
                              spellCheck={
                                field.kind === 'onsocial' ? false : undefined
                              }
                              className="w-full bg-transparent px-3 py-2.5 text-sm outline-none disabled:opacity-70"
                              placeholder={field.placeholder}
                              aria-label={field.label}
                              aria-invalid={Boolean(linkFieldErrors[field.key])}
                            />
                          </div>
                          {probingLinkKey === field.key ? (
                            <p className="px-1 text-[11px] leading-snug text-muted-foreground">
                              Checking…
                            </p>
                          ) : linkFieldErrors[field.key] ? (
                            <p className="px-1 text-[11px] leading-snug text-[var(--portal-red)]">
                              {profileLinkEditorInlineError(
                                field.kind,
                                linkFieldErrors[field.key]
                              )}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {error && !isWalletCancellationMessage(error) ? (
                      <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
                        {error}
                      </p>
                    ) : null}

                    {!hasSocialSession ? (
                      <p className="rounded-xl border border-border/45 bg-muted/22 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        {isAuthorizingSession
                          ? 'Check your wallet extension — approve the OnSocial session transaction when it appears.'
                          : 'One approval unlocks your profile and social actions for this session.'}
                      </p>
                    ) : null}
                  </div>
                </div>

                <OsSheetActions
                  layout="stack"
                  className="shrink-0 border-t border-fade-section px-4 py-4 md:px-5"
                >
                  {!profile ? (
                    <p className="portal-type-label leading-snug text-muted-foreground/60">
                      Saving your profile earns SOCIAL rewards.
                    </p>
                  ) : null}
                  <OsSheetAction
                    type="submit"
                    variant="primary"
                    ready={isDirty && !saved && hasSocialSession}
                    succeeded={saved}
                    succeededLabel="Saved"
                    pending={isAuthorizingSession || isSaving}
                    pendingLabel={
                      isAuthorizingSession ? 'Authorizing…' : 'Saving…'
                    }
                    disabled={
                      saved ||
                      !nameReady ||
                      isSaving ||
                      isAuthorizingSession ||
                      (hasSocialSession && !isDirty)
                    }
                  >
                    {!hasSocialSession ? 'Resume session to save' : submitLabel}
                  </OsSheetAction>
                  <OsSheetAction
                    type="button"
                    variant="ghost"
                    disabled={isSaving || isAuthorizingSession}
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </OsSheetAction>
                </OsSheetActions>
              </motion.form>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
      <TransactionFeedbackToast
        result={actionToast}
        onClose={() => setActionToast(null)}
      />
    </>
  );
}
