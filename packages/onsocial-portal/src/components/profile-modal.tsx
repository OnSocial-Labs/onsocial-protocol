'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  Loader2,
  PenLine,
  RefreshCw,
  User,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { Button } from '@/components/ui/button';
import type { StandingUpdateResult } from '@/hooks/use-profile';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface PortalProfileResponse {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
}

interface StandingAccountSummary {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
}

interface ProfileSocialResponse {
  accountId: string;
  viewerAccountId: string | null;
  viewerStanding: boolean;
  counts: {
    incoming: number;
    outgoing: number;
  };
  incoming: StandingAccountSummary[];
  outgoing: StandingAccountSummary[];
}

interface ProfileModalProps {
  open: boolean;
  accountId: string | null;
  viewerAccountId: string | null;
  selfProfile: MaterialisedProfile | null;
  selfAvatarUrl: string | null;
  hasSocialSession?: boolean;
  isUpdatingStanding?: boolean;
  onOpenChange: (open: boolean) => void;
  onEditProfile: () => void;
  onSelectAccount?: (accountId: string) => void;
  onUpdateStanding: (
    accountId: string,
    shouldStand: boolean
  ) => Promise<StandingUpdateResult>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile request failed';
}

async function fetchPortalProfile(
  accountId: string
): Promise<PortalProfileResponse> {
  const response = await fetch(
    `/api/profile?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<PortalProfileResponse> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ?? body?.error ?? `Profile query failed (${response.status})`
    );
  }

  return {
    accountId,
    profile: body?.profile ?? null,
    avatarUrl: body?.avatarUrl ?? null,
  };
}

async function fetchProfileSocial(
  accountId: string,
  viewerAccountId: string | null
): Promise<ProfileSocialResponse> {
  const search = new URLSearchParams({ accountId });
  if (viewerAccountId) search.set('viewerAccountId', viewerAccountId);

  const response = await fetch(`/api/profile/social?${search.toString()}`, {
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<ProfileSocialResponse> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Social graph query failed (${response.status})`
    );
  }

  return {
    accountId,
    viewerAccountId: body?.viewerAccountId ?? null,
    viewerStanding: Boolean(body?.viewerStanding),
    counts: {
      incoming: Number(body?.counts?.incoming ?? 0),
      outgoing: Number(body?.counts?.outgoing ?? 0),
    },
    incoming: body?.incoming ?? [],
    outgoing: body?.outgoing ?? [],
  };
}

function displayName(
  profile: MaterialisedProfile | null,
  accountId: string | null
): string {
  if (profile?.name?.trim()) return profile.name.trim();
  return accountId ? cleanHandle(accountId) : 'OnSocial account';
}

function cleanHandle(accountId: string): string {
  return accountId.replace(/\.(testnet|near)$/u, '');
}

function formatCount(count: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(count);
}

function accountLabel(account: StandingAccountSummary): string {
  return account.name?.trim() || cleanHandle(account.accountId);
}

function buildStandingSentence({
  incoming,
  count,
  targetName,
  isSelf,
}: {
  incoming: StandingAccountSummary[];
  count: number;
  targetName: string;
  isSelf: boolean;
}): string {
  const target = isSelf ? 'you' : targetName;
  if (count <= 0)
    return isSelf
      ? 'No one stands with you yet.'
      : `No one stands with ${target} yet.`;

  const names = incoming.slice(0, 2).map(accountLabel);
  if (count === 1 && names[0]) return `${names[0]} stands with ${target}.`;
  if (count === 2 && names.length === 2) {
    return `${names[0]} and ${names[1]} stand with ${target}.`;
  }
  if (names.length >= 2) {
    return `${names[0]}, ${names[1]} and ${formatCount(count - 2)} others stand with ${target}.`;
  }
  return `${formatCount(count)} people stand with ${target}.`;
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/45 bg-muted/18 px-3 py-3 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function AccountAvatar({
  avatarUrl,
  className,
}: {
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 text-muted-foreground',
        className
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className="h-4 w-4" />
      )}
    </div>
  );
}

function StandingList({
  title,
  accounts,
  emptyLabel,
  onSelectAccount,
}: {
  title: string;
  accounts: StandingAccountSummary[];
  emptyLabel: string;
  onSelectAccount?: (accountId: string) => void;
}) {
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Users className="h-4 w-4 text-muted-foreground/55" />
      </div>

      {accounts.length > 0 ? (
        <div className="space-y-1.5">
          {accounts.map((account) => (
            <button
              key={account.accountId}
              type="button"
              onClick={() => onSelectAccount?.(account.accountId)}
              className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 text-left transition-colors hover:border-border/45 hover:bg-muted/24 focus-visible:border-border/70 focus-visible:outline-none"
            >
              <AccountAvatar
                avatarUrl={account.avatarUrl}
                className="h-8 w-8"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {accountLabel(account)}
                </span>
                {account.name ? (
                  <span className="block truncate text-[11px] text-muted-foreground/55">
                    {account.accountId}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>{emptyLabel}</EmptyState>
      )}
    </section>
  );
}

export function ProfileModal({
  open,
  accountId,
  viewerAccountId,
  selfProfile,
  selfAvatarUrl,
  hasSocialSession = false,
  isUpdatingStanding = false,
  onOpenChange,
  onEditProfile,
  onSelectAccount,
  onUpdateStanding,
}: ProfileModalProps) {
  const reduceMotion = useReducedMotion();
  const [profile, setProfile] = useState<MaterialisedProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [social, setSocial] = useState<ProfileSocialResponse | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSaved, setActionSaved] = useState(false);
  const latestSocialLoadRef = useRef(0);
  const isSelf = Boolean(accountId && viewerAccountId === accountId);
  const title = displayName(profile, accountId);
  const bio = profile?.bio?.trim();
  const canStand = Boolean(accountId && viewerAccountId && !isSelf);
  const viewerStanding = Boolean(social?.viewerStanding);
  const solidarity = useMemo(() => {
    if (!social) return [];
    const outgoingIds = new Set(
      social.outgoing.map((account) => account.accountId)
    );
    return social.incoming.filter((account) =>
      outgoingIds.has(account.accountId)
    );
  }, [social]);

  const refreshSocial = useCallback(async () => {
    if (!accountId) return;
    const loadId = latestSocialLoadRef.current + 1;
    latestSocialLoadRef.current = loadId;
    setIsSocialLoading(true);
    setSocialError(null);

    try {
      const result = await fetchProfileSocial(accountId, viewerAccountId);
      if (latestSocialLoadRef.current !== loadId) return;
      setSocial(result);
    } catch (error) {
      if (latestSocialLoadRef.current !== loadId) return;
      setSocialError(getErrorMessage(error));
    } finally {
      if (latestSocialLoadRef.current === loadId) setIsSocialLoading(false);
    }
  }, [accountId, viewerAccountId]);

  useEffect(() => {
    if (!open || !accountId) {
      latestSocialLoadRef.current += 1;
      return;
    }

    setSocial(null);
    setSocialError(null);
  }, [accountId, open]);

  useEffect(() => {
    if (!open || !accountId) return;

    let cancelled = false;
    setActionError(null);
    setActionSaved(false);

    if (isSelf) {
      setProfile(selfProfile);
      setAvatarUrl(selfAvatarUrl);
    } else {
      setProfile(null);
      setAvatarUrl(null);
    }

    setIsProfileLoading(true);
    setProfileError(null);

    void fetchPortalProfile(accountId)
      .then((result) => {
        if (cancelled) return;
        setProfile(result.profile);
        setAvatarUrl(result.avatarUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        setProfileError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, isSelf, open, selfAvatarUrl, selfProfile]);

  useEffect(() => {
    if (!open || !accountId) return;
    void refreshSocial();
  }, [accountId, open, refreshSocial]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isUpdatingStanding) {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUpdatingStanding, onOpenChange, open]);

  const stats = useMemo(
    () => [
      {
        label: 'Standing',
        value: social?.counts.incoming ?? 0,
      },
      {
        label: 'Standing With',
        value: social?.counts.outgoing ?? 0,
      },
    ],
    [social]
  );

  const handleStanding = async () => {
    if (!accountId || !canStand || isUpdatingStanding) return;

    const nextStanding = !viewerStanding;
    setActionError(null);
    setActionSaved(false);
    setSocial((current) => {
      if (!current) return current;
      return {
        ...current,
        viewerStanding: nextStanding,
        counts: {
          ...current.counts,
          incoming: Math.max(
            0,
            current.counts.incoming + (nextStanding ? 1 : -1)
          ),
        },
      };
    });

    try {
      await onUpdateStanding(accountId, nextStanding);
      setActionSaved(true);
      window.setTimeout(() => setActionSaved(false), 1800);
      void refreshSocial();
    } catch (error) {
      setSocial((current) => {
        if (!current) return current;
        return {
          ...current,
          viewerStanding,
          counts: {
            ...current.counts,
            incoming: Math.max(
              0,
              current.counts.incoming + (nextStanding ? -1 : 1)
            ),
          },
        };
      });
      setActionError(getErrorMessage(error));
    }
  };

  const standingSentence = buildStandingSentence({
    incoming: social?.incoming ?? [],
    count: social?.counts.incoming ?? 0,
    targetName: title,
    isSelf,
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open && accountId ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          className="fixed inset-0 z-[2147483645] flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label="Close profile"
            disabled={isUpdatingStanding}
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 16,
              scale: 0.98,
              duration: 0.22,
              exitY: 10,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
            className="relative max-h-[min(760px,calc(100vh-2rem))] w-full max-w-2xl overflow-hidden rounded-2xl border border-border/67 bg-background/98 shadow-[0_26px_90px_-34px_rgba(15,23,42,0.72)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-fade-section px-4 py-4 md:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
                  {accountId}
                </p>
                <h2
                  id="profile-modal-title"
                  className="mt-1 truncate text-lg font-semibold text-foreground"
                >
                  {title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isUpdatingStanding}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/45 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                aria-label="Close profile"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-4 py-5 md:px-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <AccountAvatar
                  avatarUrl={avatarUrl}
                  className="h-20 w-20 rounded-2xl sm:h-24 sm:w-24"
                />

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 truncate text-xl font-semibold text-foreground">
                        {title}
                      </h3>
                      {isProfileLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/55" />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {accountId}
                    </p>
                  </div>

                  {bio ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {bio}
                    </p>
                  ) : (
                    <p className="text-sm leading-relaxed text-muted-foreground/70">
                      No bio yet.
                    </p>
                  )}

                  <p className="rounded-xl border border-border/45 bg-muted/18 px-3 py-2.5 text-sm leading-relaxed text-foreground/88">
                    {isSocialLoading && !social
                      ? 'Loading standing...'
                      : standingSentence}
                  </p>

                  {profileError ? (
                    <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
                      {profileError}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border/45 bg-muted/18 px-3 py-3"
                  >
                    <p className="text-xl font-semibold text-foreground">
                      {isSocialLoading && !social
                        ? '...'
                        : formatCount(stat.value)}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              {socialError ? (
                <p className="mt-4 rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
                  {socialError}
                </p>
              ) : null}

              {actionError ? (
                <p className="mt-4 rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
                  {actionError}
                </p>
              ) : null}

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                {solidarity.length > 0 ? (
                  <div className="md:col-span-2">
                    <StandingList
                      title="Solidarity"
                      accounts={solidarity}
                      emptyLabel=""
                      onSelectAccount={onSelectAccount}
                    />
                  </div>
                ) : null}
                <StandingList
                  title="Standing With"
                  accounts={social?.outgoing ?? []}
                  emptyLabel={
                    isSelf
                      ? 'You are not standing with anyone yet.'
                      : `${title} is not standing with anyone yet.`
                  }
                  onSelectAccount={onSelectAccount}
                />
                <StandingList
                  title="Standing"
                  accounts={social?.incoming ?? []}
                  emptyLabel={
                    isSelf
                      ? 'No one stands with you yet.'
                      : `No one stands with ${title} yet.`
                  }
                  onSelectAccount={onSelectAccount}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-fade-section px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
              <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
                {isSocialLoading && social ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Refreshing graph
                  </>
                ) : actionSaved ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--portal-green)]" />
                    Standing With updated
                  </>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2">
                {isSelf ? (
                  <Button type="button" size="sm" onClick={onEditProfile}>
                    <PenLine className="h-4 w-4" />
                    Edit profile
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={viewerStanding ? 'outline' : 'accent'}
                    disabled={!canStand || isUpdatingStanding}
                    onClick={handleStanding}
                  >
                    {isUpdatingStanding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : viewerStanding ? (
                      <UserMinus className="h-4 w-4" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {viewerStanding
                      ? 'Standing With'
                      : hasSocialSession
                        ? 'Stand With'
                        : 'Authorize & Stand'}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
