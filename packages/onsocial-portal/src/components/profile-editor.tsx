'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Camera, Check, Loader2, X } from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { Button } from '@/components/ui/button';
import type { ProfileSaveInput, ProfileSaveResult } from '@/hooks/use-profile';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface ProfileEditorProps {
  open: boolean;
  accountId: string | null;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
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

export function ProfileEditor({
  open,
  accountId,
  profile,
  avatarUrl,
  isSaving = false,
  isAuthorizingSession = false,
  hasSocialSession = false,
  error,
  onOpenChange,
  onSave,
}: ProfileEditorProps) {
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(getInitialName(profile));
  const [bio, setBio] = useState(getInitialBio(profile));
  const [avatar, setAvatar] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const previewUrl = useObjectUrl(avatar);
  const displayAvatarUrl = previewUrl ?? avatarUrl;
  const title = profile ? 'Edit profile' : 'Create profile';
  const submitLabel = hasSocialSession
    ? profile
      ? 'Save profile'
      : 'Create profile'
    : 'Authorize & save';
  const nameReady = name.trim().length > 0;

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
  const markDirty = () => {
    if (saved) setSaved(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nameReady || isSaving) return;

    setLocalError(null);
    try {
      await onSave({ name, bio, avatar });
      setSaved(true);
    } catch (err) {
      setSaved(false);
      setLocalError(err instanceof Error ? err.message : 'Profile save failed');
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
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
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/67 bg-background/98 shadow-[0_26px_80px_-34px_rgba(15,23,42,0.72)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-fade-section px-4 py-4 md:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
                  {accountId ?? 'Wallet'}
                </p>
                <h2
                  id="profile-editor-title"
                  className="mt-1 text-lg font-semibold text-foreground"
                >
                  {title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                aria-label="Close profile editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-4 py-5 md:px-5">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/55 bg-muted/30 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  aria-label="Choose avatar"
                >
                  {displayAvatarUrl ? (
                    <img
                      src={displayAvatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Camera className="h-6 w-6" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-background/80 py-1 text-[10px] font-medium opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    Change
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Profile identity
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Your public identity across OnSocial.
                  </p>
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
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Display name
                </span>
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    markDirty();
                  }}
                  maxLength={80}
                  autoComplete="name"
                  className="h-11 w-full rounded-xl border border-border/50 bg-background/55 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-border"
                  placeholder="Your name"
                />
              </label>

              <label className="block space-y-2">
                <span className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                  <span>Bio</span>
                  <span className="text-[11px] text-muted-foreground/55">
                    {characterCount}/180
                  </span>
                </span>
                <textarea
                  value={bio}
                  onChange={(event) => {
                    setBio(event.target.value);
                    markDirty();
                  }}
                  maxLength={180}
                  rows={4}
                  className="min-h-24 w-full resize-none rounded-xl border border-border/50 bg-background/55 px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-border"
                  placeholder="What are you building?"
                />
              </label>

              {localError || error ? (
                <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
                  {localError ?? error}
                </p>
              ) : null}

              {!hasSocialSession ? (
                <p className="rounded-xl border border-border/45 bg-muted/22 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  One approval creates a scoped OnSocial session for profile and
                  social actions.
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-fade-section px-4 py-4 md:px-5">
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
                variant={saved ? 'accent' : 'default'}
                size="sm"
                disabled={!nameReady || isSaving}
                className={cn(saved && 'pointer-events-none')}
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4" />
                    Saved
                  </>
                ) : isAuthorizingSession ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authorizing
                  </>
                ) : isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  submitLabel
                )}
              </Button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
