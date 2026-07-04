'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MaterialisedProfile } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { creditAppPlatformReward } from '@/lib/app-platform-rewards';
import type { ResolvedPageHero } from '@/lib/page-data';
import {
  normalizeProfileLinksInput,
  profileLinksInputFromRecord,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  normalizeProfileEditorTags,
  profileEditorTagsEqual,
} from '@/lib/profile-tag-editor';

export interface ProfileEditorSnapshot {
  accountId: string;
  hasProfile: boolean;
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerMedia: ResolvedPageHero | null;
  links: MaterialisedProfile['links'];
  tags: string[];
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
  tags: string[];
  currentTags: string[];
}

export interface ProfileEditorSaveResult {
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerMedia: ResolvedPageHero | null;
}

function formatProfileEditorError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not save profile.';
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
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!accountId) {
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setError(null);

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

      setSnapshot(body as ProfileEditorSnapshot);
    } catch (err) {
      setSnapshot(null);
      setError(formatProfileEditorError(err));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!enabled) {
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

      setSaving(true);
      setError(null);

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

        const normalizedTags = normalizeProfileEditorTags(input.tags);
        const snapshotTags = normalizeProfileEditorTags(input.currentTags);
        if (!profileEditorTagsEqual(normalizedTags, snapshotTags)) {
          payload.tags = normalizedTags;
        }

        const response = await client.profiles.update(payload, { wait: true });
        if (session) {
          creditAppPlatformReward({
            accountId: signingAccountId,
            action: 'profile_created',
            proof: { txHash: response.txHash ?? '' },
            session,
          });
        }

        const refreshed = await client.profiles.get(accountId);
        const avatarUrl = refreshed
          ? client.profiles.avatarUrl(refreshed)
          : null;
        const bannerUrl = refreshed
          ? client.profiles.bannerUrl(refreshed)
          : null;
        const bannerMedia = refreshed
          ? client.profiles.bannerMedia(refreshed)
          : null;

        router.refresh();

        return {
          name,
          bio: input.bio.trim(),
          avatarUrl,
          bannerUrl,
          bannerMedia,
        };
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          throw err;
        }
        const message = formatProfileEditorError(err);
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [accountId, getClient, router]
  );

  return {
    snapshot,
    loading,
    saving,
    error,
    setError,
    loadProfile,
    saveProfile,
    hasSocialSession,
    isBootstrappingSession,
    connect,
    linksFromSnapshot: profileLinksInputFromRecord(snapshot?.links),
    tagsFromSnapshot: normalizeProfileEditorTags(snapshot?.tags ?? []),
  };
}
