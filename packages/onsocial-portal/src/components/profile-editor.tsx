'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Camera, Check, Github, Globe } from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { Button } from '@/components/ui/button';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import {
  TransactionFeedbackToast,
  type TransactionFeedback,
} from '@/components/ui/transaction-feedback-toast';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import type {
  ProfileSaveInput,
  ProfileSaveResult,
} from '@/contexts/profile-context';
import {
  normalizeProfileHandleInput,
  normalizeProfileLinksInput,
  normalizeWebsiteForDisplay,
  type ProfileLinksInput,
  type ProfileSocialLinkKind,
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

function normalizeInitialWebsite(value?: string): string {
  if (!value) return '';
  try {
    return normalizeWebsiteForDisplay(value);
  } catch {
    return value;
  }
}

function normalizeInitialHandle(
  value: string | undefined,
  kind: ProfileSocialLinkKind
): string {
  if (!value) return '';
  try {
    return normalizeProfileHandleInput(value, kind);
  } catch {
    return value.trim().replace(/^@/, '');
  }
}

function getInitialLinks(
  profile: MaterialisedProfile | null
): ProfileLinksInput {
  const links = profile?.links;

  return {
    website: normalizeInitialWebsite(links?.website),
    x: normalizeInitialHandle(links?.x ?? links?.twitter, 'x'),
    telegram: normalizeInitialHandle(links?.telegram, 'telegram'),
    github: normalizeInitialHandle(links?.github, 'github'),
  };
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
    getInitialLinks(profile)
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
  const headerTitle = useMemo(() => {
    const trimmedName = name.trim();
    if (trimmedName) return trimmedName;
    return profile ? 'Edit profile' : 'Create profile';
  }, [name, profile]);
  const submitLabel = hasSocialSession
    ? profile
      ? 'Save profile'
      : 'Create profile'
    : 'Authorize & save';
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

  const characterCount = useMemo(() => bio.trim().length, [bio]);
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
                aria-labelledby="profile-editor-title"
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
                      <p className="pointer-events-none absolute inset-x-4 bottom-0 text-right text-[9px] tabular-nums leading-none text-muted-foreground/45 md:inset-x-5 sm:text-[10px]">
                        1500&times;300
                      </p>
                    </div>

                    <div className="relative z-10 -mt-8 flex items-start gap-3.5 px-4 md:px-5">
                      <div className="flex shrink-0 flex-col items-center gap-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="group relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl !border-[3px] !border-background bg-background text-muted-foreground shadow-lg md:h-24 md:w-24"
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
                            className={profileMediaOverlayClass(
                              Boolean(displayAvatarUrl),
                              'rounded-[13px]'
                            )}
                          >
                            <Camera
                              className="h-6 w-6 transition-transform duration-200 group-hover:scale-110"
                              strokeWidth={2.5}
                            />
                          </span>
                        </button>
                        <span className="text-[9px] tabular-nums leading-none text-muted-foreground/45 sm:text-[10px]">
                          512&times;512
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 pb-1 pt-10 pr-10">
                        <h2
                          id="profile-editor-title"
                          className="truncate text-lg font-semibold leading-tight text-foreground"
                        >
                          {headerTitle}
                        </h2>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground/55">
                          {accountId ? `@${accountId}` : 'Wallet'}
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
                    <div className="portal-field-focus relative rounded-2xl border border-border/40 bg-background/45">
                      <input
                        id="profile-name"
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value);
                          markDirty();
                        }}
                        maxLength={50}
                        autoComplete="name"
                        className="w-full bg-transparent px-4 py-3 pr-16 text-sm outline-none"
                        placeholder="Display name"
                        aria-label="Display name"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums tracking-wide text-muted-foreground/60">
                        {name.length}/50
                      </span>
                    </div>

                    <div className="portal-field-focus relative rounded-2xl border border-border/40 bg-background/45">
                      <textarea
                        id="profile-bio"
                        value={bio}
                        onChange={(event) => {
                          setBio(event.target.value);
                          markDirty();
                        }}
                        maxLength={180}
                        rows={2}
                        className="w-full resize-none bg-transparent px-4 pt-3 pb-6 text-sm leading-relaxed outline-none"
                        placeholder="Bio"
                        aria-label="Bio"
                      />
                      <span className="pointer-events-none absolute right-3 bottom-1.5 text-[10px] tabular-nums tracking-wide text-muted-foreground/60">
                        {characterCount}/180
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="portal-field-focus col-span-2 flex items-center rounded-2xl border border-border/40 bg-background/45">
                        <span className="border-r border-border/60 px-3 text-sm text-muted-foreground">
                          <Globe className="h-3.5 w-3.5" />
                        </span>
                        <input
                          id="profile-website"
                          value={links.website}
                          onChange={(event) =>
                            updateLink('website', event.target.value)
                          }
                          maxLength={255}
                          inputMode="url"
                          autoComplete="url"
                          className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
                          placeholder="Website"
                          aria-label="Website"
                        />
                      </div>
                      <div className="portal-field-focus flex items-center rounded-2xl border border-border/40 bg-background/45">
                        <span className="border-r border-border/60 px-3 text-sm text-muted-foreground">
                          @
                        </span>
                        <input
                          id="profile-x"
                          value={links.x}
                          onChange={(event) =>
                            updateLink('x', event.target.value)
                          }
                          maxLength={80}
                          autoComplete="off"
                          className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
                          placeholder="X"
                          aria-label="X handle"
                        />
                      </div>
                      <div className="portal-field-focus flex items-center rounded-2xl border border-border/40 bg-background/45">
                        <span className="border-r border-border/60 px-3 text-sm text-muted-foreground">
                          @
                        </span>
                        <input
                          id="profile-telegram"
                          value={links.telegram}
                          onChange={(event) =>
                            updateLink('telegram', event.target.value)
                          }
                          maxLength={80}
                          autoComplete="off"
                          className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
                          placeholder="Telegram"
                          aria-label="Telegram handle"
                        />
                      </div>
                      <div className="portal-field-focus col-span-2 flex items-center rounded-2xl border border-border/40 bg-background/45">
                        <span className="border-r border-border/60 px-3 text-sm text-muted-foreground">
                          <Github className="h-3.5 w-3.5" />
                        </span>
                        <input
                          id="profile-github"
                          value={links.github}
                          onChange={(event) =>
                            updateLink('github', event.target.value)
                          }
                          maxLength={80}
                          autoComplete="off"
                          className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
                          placeholder="GitHub"
                          aria-label="GitHub username"
                        />
                      </div>
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
                    <p className="text-[11px] leading-snug text-muted-foreground/60">
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
