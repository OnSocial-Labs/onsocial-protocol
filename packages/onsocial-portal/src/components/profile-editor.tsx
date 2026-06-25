'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Camera, Check } from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { Button } from '@/components/ui/button';
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
  normalizeProfileLinksInput,
  PROFILE_LINK_EDITOR_FIELDS,
  profileLinksInputFromRecord,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  reportWalletActionFailure,
  isWalletUserCancellation,
  isWalletCancellationMessage,
} from '@/lib/wallet-errors';
import { cn } from '@/lib/utils';

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

function profileMediaEmptyFillClass(roundedClass?: string): string {
  return cn('absolute inset-0 bg-muted/45 dark:bg-muted/25', roundedClass);
}

function profileMediaOverlayClass(
  hasMedia: boolean,
  roundedClass?: string
): string {
  return cn(
    'absolute inset-0 flex items-center justify-center transition-all duration-200',
    roundedClass,
    hasMedia
      ? 'bg-black/22 text-white/50 group-hover:bg-black/40 group-hover:text-white/90 group-hover:backdrop-blur-[2px]'
      : cn(
          'text-muted-foreground/45',
          // Light: darker rest → lighter hover, dark camera (mirror of dark mode).
          'group-hover:bg-white/45 group-hover:text-foreground/75',
          // Dark: lighter rest → darker hover, white camera.
          'dark:group-hover:bg-black/22 dark:group-hover:text-white/90'
        )
  );
}

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
  const [name, setName] = useState(getInitialName(profile));
  const [bio, setBio] = useState(getInitialBio(profile));
  const [links, setLinks] = useState<ProfileLinksInput>(() =>
    profileLinksInputFromRecord(profile?.links)
  );
  const [avatar, setAvatar] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [actionToast, setActionToast] = useState<TransactionFeedback | null>(
    null
  );
  const [saved, setSaved] = useState(false);
  const previewUrl = useObjectUrl(avatar);
  const bannerPreviewUrl = useObjectUrl(banner);
  const displayAvatarUrl = previewUrl ?? avatarUrl;
  const displayBannerUrl = bannerPreviewUrl ?? bannerUrl;
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
  const hasCurrentLinks = Boolean(
    profile?.links && Object.keys(profile.links).length > 0
  );
  const hasLinkInput = Object.values(links).some((value) => value.trim());
  const markDirty = () => {
    if (saved) setSaved(false);
  };

  const updateLink = (key: keyof ProfileLinksInput, value: string) => {
    setLinks((current) => ({ ...current, [key]: value }));
    markDirty();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nameReady || isSaving) return;

    setActionToast(null);
    try {
      const normalizedLinks = normalizeProfileLinksInput(links, profile?.links);
      const shouldSaveLinks =
        hasCurrentLinks ||
        hasLinkInput ||
        Object.keys(normalizedLinks).length > 0;

      await onSave({
        name,
        bio,
        avatar,
        banner,
        ...(shouldSaveLinks ? { links: normalizedLinks } : {}),
      });
      setSaved(true);
    } catch (err) {
      setSaved(false);
      if (isWalletUserCancellation(err)) return;
      reportWalletActionFailure(err, (msg) =>
        setActionToast({ type: 'error', msg })
      );
    }
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
                    <div className="relative pb-3">
                      <button
                        type="button"
                        onClick={() => bannerInputRef.current?.click()}
                        className="group relative flex aspect-[5/1] w-full cursor-pointer items-center justify-center overflow-hidden bg-background text-muted-foreground"
                        aria-label="Choose profile banner"
                      >
                        {!displayBannerUrl ? (
                          <span
                            aria-hidden
                            className={profileMediaEmptyFillClass()}
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
                          className={profileMediaOverlayClass(
                            Boolean(displayBannerUrl)
                          )}
                        >
                          <Camera
                            className="h-6 w-6 transition-transform duration-200 group-hover:scale-110"
                            strokeWidth={2.5}
                          />
                        </span>
                      </button>
                      <p className="pointer-events-none absolute inset-x-4 bottom-0 text-right portal-type-micro tabular-nums leading-none text-muted-foreground/45 md:inset-x-5">
                        1500&times;300
                      </p>
                    </div>

                    <div
                      className={cn(
                        'relative z-10 space-y-3 pb-2',
                        profileIdentityLayoutClass,
                        profileIdentityOverlapClass,
                        'px-4 md:px-5'
                      )}
                    >
                      <div className="space-y-2 pr-8">
                        <div className="flex items-start gap-3.5">
                          <div className={profileIdentityAvatarDockClass}>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className={cn(
                                'group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl !border-[3px] !border-background bg-background text-muted-foreground shadow-lg',
                                profileIdentityAvatarSizeClass
                              )}
                              aria-label="Choose avatar"
                            >
                              {!displayAvatarUrl ? (
                                <span
                                  aria-hidden
                                  className={profileMediaEmptyFillClass(
                                    'rounded-[13px]'
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
                                  profileMediaOverlayClass(
                                    Boolean(displayAvatarUrl),
                                    'rounded-[13px]'
                                  )
                                )}
                              >
                                <Camera
                                  className="h-6 w-6 transition-transform duration-200 group-hover:scale-110"
                                  strokeWidth={2.5}
                                />
                              </span>
                            </button>
                            <span className="portal-type-micro tabular-nums leading-none text-muted-foreground/45">
                              512&times;512
                            </span>
                          </div>
                        </div>

                        <div className={profileIdentityTextClass}>
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
                          <p className="portal-type-caption tabular-nums text-muted-foreground/45">
                            {name.length}/50
                          </p>
                        </div>
                      </div>

                      <div>
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
                          maxLength={180}
                          rows={2}
                          className="w-full resize-none bg-transparent portal-type-body leading-relaxed text-muted-foreground outline-none"
                        />
                        <p className="mt-0.5 portal-type-caption tabular-nums text-muted-foreground/45">
                          {characterCount}/180
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
                            'portal-field-focus flex items-center rounded-2xl border border-border/40 bg-background/45',
                            field.fullWidth && 'col-span-2'
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
                            maxLength={field.kind === 'website' ? 255 : 80}
                            inputMode={
                              field.kind === 'website' ? 'url' : undefined
                            }
                            autoComplete={
                              field.kind === 'website' ? 'url' : 'off'
                            }
                            className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
                            placeholder={field.placeholder}
                            aria-label={field.label}
                          />
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

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-fade-section px-4 py-4 md:px-5">
                  {!profile ? (
                    <p className="portal-type-label leading-snug text-muted-foreground/60">
                      Saving your profile earns SOCIAL rewards.
                    </p>
                  ) : (
                    <span aria-hidden />
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => onOpenChange(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="default"
                      size="sm"
                      disabled={!nameReady || isSaving}
                      loading={isAuthorizingSession || isSaving}
                      className={cn(
                        'min-w-[116px]',
                        saved && 'pointer-events-none'
                      )}
                    >
                      {saved ? (
                        <>
                          <Check className="h-4 w-4" />
                          Saved
                        </>
                      ) : (
                        submitLabel
                      )}
                    </Button>
                  </div>
                </div>
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
