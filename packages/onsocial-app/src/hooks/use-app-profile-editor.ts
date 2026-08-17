'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MaterialisedProfile, PageConfig } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { creditAppPlatformReward } from '@/lib/app-platform-rewards';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import type { PublicPageConfig, ResolvedPageHero } from '@/lib/page-data';
import {
  linkNotesEqual,
  pruneLinkNotes,
  sanitizeLinkNotes,
} from '@/lib/page-launch-config';
import { isProfileEditorContentDirty } from '@/lib/profile-editor-dirty';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';
import {
  normalizeProfileLinksInput,
  profileLinksInputFromRecord,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export interface ProfileEditorSnapshot {
  accountId: string;
  hasProfile: boolean;
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerMedia: ResolvedPageHero | null;
  links: MaterialisedProfile['links'];
  pageConfig: PublicPageConfig;
}

export interface ProfileEditorSaveInput {
  name: string;
  bio: string;
  avatar: File | null;
  banner: File | null;
  removeAvatar: boolean;
  removeBanner: boolean;
  links: ProfileLinksInput;
  currentLinks: MaterialisedProfile['links'];
  hasCurrentLinks: boolean;
  hasLinkInput: boolean;
  linkNotes: Record<string, string>;
}

export interface ProfileEditorSaveResult {
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerMedia: ResolvedPageHero | null;
  txHash?: string | null;
}

function formatProfileEditorError(
  error: unknown,
  fallback = 'Could not save profile.'
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  if (!message || message === 'Failed to fetch') {
    return 'Could not reach OnSocial. Check your connection and try again.';
  }

  return message;
}

export function useAppProfileEditor(
  accountId: string | null,
  enabled: boolean
) {
  const router = useRouter();
  const { hasSocialSession, isBootstrappingSession, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [snapshot, setSnapshot] = useState<ProfileEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!accountId) {
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(
        `/api/profile/editor?accountId=${encodeURIComponent(accountId)}`,
        { cache: 'no-store' }
      );
      const body = (await response.json().catch(() => null)) as
        | ProfileEditorSnapshot
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body && 'error' in body && body.error
            ? body.error
            : 'Could not load profile.'
        );
      }

      setSnapshot({
        ...(body as ProfileEditorSnapshot),
        pageConfig: (body as ProfileEditorSnapshot).pageConfig ?? {},
      });
    } catch (err) {
      setSnapshot(null);
      setLoadError(formatProfileEditorError(err, 'Could not load profile.'));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    void loadProfile();
  }, [enabled, loadProfile]);

  const saveProfile = useCallback(
    async (input: ProfileEditorSaveInput): Promise<ProfileEditorSaveResult> => {
      if (!accountId) {
        throw new Error('Connect your wallet before saving a profile.');
      }

      const name = input.name.trim();
      if (!name) {
        throw new Error('Profile name is required.');
      }

      const snapshotNow = snapshot;
      if (!snapshotNow || snapshotNow.accountId !== accountId) {
        throw new Error('Could not load profile.');
      }

      const nextNotes = pruneLinkNotes(input.linkNotes, input.links);
      const notesDirty = !linkNotesEqual(
        nextNotes,
        snapshotNow.pageConfig?.linkNotes
      );
      const contentDirty = isProfileEditorContentDirty({
        snapshot: snapshotNow,
        linksFromSnapshot: profileLinksInputFromRecord(snapshotNow.links),
        name,
        bio: input.bio,
        links: input.links,
        avatarFile: input.avatar,
        bannerFile: input.banner,
        avatarRemoved: input.removeAvatar,
        bannerRemoved: input.removeBanner,
      });

      if (!contentDirty && !notesDirty) {
        return {
          name,
          bio: input.bio.trim(),
          avatarUrl: snapshotNow.avatarUrl,
          bannerUrl: snapshotNow.bannerUrl,
          bannerMedia: snapshotNow.bannerMedia,
          txHash: null,
        };
      }

      setSaving(true);

      try {
        const {
          client,
          accountId: signingAccountId,
          session,
        } = await getClient();
        const normalizedLinks = normalizeProfileLinksInput(
          input.links,
          input.currentLinks ?? undefined
        );
        const shouldSaveLinks =
          input.hasCurrentLinks ||
          input.hasLinkInput ||
          Object.keys(normalizedLinks).length > 0;

        let txHash: string | null = null;

        if (contentDirty) {
          const payload: Parameters<typeof client.profiles.update>[0] = {
            name,
            bio: input.bio.trim(),
          };

          if (input.avatar) {
            payload.avatar = input.avatar;
          } else if (input.removeAvatar) {
            payload.avatar = null;
          }
          if (input.banner) {
            payload.banner = input.banner;
          } else if (input.removeBanner) {
            payload.banner = null;
          }
          if (shouldSaveLinks) {
            payload.links = normalizedLinks;
          }

          // Bio save also writes hashtags/tickers/mentions via SDK extract-on-save.
          const response = await client.profiles.update(payload, { wait: true });
          txHash = response.txHash ?? null;
          if (session) {
            creditAppPlatformReward({
              accountId: signingAccountId,
              action: 'profile_created',
              proof: { txHash: txHash ?? '' },
              session,
            });
          }
        }

        if (notesDirty) {
          const current = await fetchPageConfigFromBrowserProxy(signingAccountId);
          const notes = sanitizeLinkNotes(nextNotes);
          const next: PageConfig = {
            ...((snapshotNow.pageConfig ?? {}) as PageConfig),
            ...current,
            linkNotes: Object.keys(notes).length > 0 ? notes : undefined,
          };
          const pageResponse = await client.pages.setConfig(next, {
            wait: true,
          });
          if (!txHash) {
            txHash = collectRelayTxHashes(pageResponse)[0] ?? null;
          }
        }

        const refreshed = contentDirty
          ? await client.profiles.get(accountId)
          : null;
        const avatarUrl = refreshed
          ? client.profiles.avatarUrl(refreshed)
          : snapshotNow.avatarUrl;
        const bannerUrl = refreshed
          ? client.profiles.bannerUrl(refreshed)
          : snapshotNow.bannerUrl;
        const bannerMedia = refreshed
          ? client.profiles.bannerMedia(refreshed)
          : snapshotNow.bannerMedia;

        router.refresh();

        return {
          name,
          bio: input.bio.trim(),
          avatarUrl,
          bannerUrl,
          bannerMedia,
          txHash,
        };
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          throw err;
        }
        // Save failures are surfaced by the sheet toast — do not stash inline.
        throw new Error(formatProfileEditorError(err));
      } finally {
        setSaving(false);
      }
    },
    [accountId, getClient, router, snapshot]
  );

  return {
    snapshot,
    loading,
    saving,
    loadError,
    loadProfile,
    saveProfile,
    hasSocialSession,
    isBootstrappingSession,
    connect,
    linksFromSnapshot: profileLinksInputFromRecord(snapshot?.links),
  };
}
