'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  editorFaceKind,
  formatProfileMediaRef,
  normalizeProfileIndustryInput,
  normalizeProfileLeadInput,
  normalizeProfileAboutAlign,
  normalizeProfileLocationInput,
  type MaterialisedProfile,
  type PageConfig,
  type ProfileAboutAlign,
  type ProfileKind,
} from '@onsocial/sdk';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { creditAppPlatformReward } from '@/lib/app-platform-rewards';
import { connectBefore } from '@/lib/connect-continue-voice';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import type { PublicPageConfig, ResolvedPageHero } from '@/lib/page-data';
import {
  linkNotesEqual,
  pruneLinkNotes,
  sanitizeLinkNotes,
} from '@/lib/page-launch-config';
import {
  isProfileEditorContentDirty,
  normalizeProfileEditorName,
} from '@/lib/profile-editor-dirty';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';
import {
  parseProfileAboutPhotoRefs,
  profileAboutPhotoRefsEqual,
  type ProfileAboutPhoto,
} from '@/lib/profile-about-photos';
import { normalizeProfileEditorTags } from '@/lib/profile-tag-editor';
import {
  normalizeProfileLinksInput,
  profileLinksInputFromRecord,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import {
  applyPortfolioWebsites,
  linkImagesEqual,
  readPortfolioWebsites,
  sanitizeLinkImages,
  type PortfolioWebsiteDraft,
} from '@/lib/profile-websites';
import { probeNearAccountExists } from '@/hooks/use-near-account-status';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export interface ProfileEditorSnapshot {
  accountId: string;
  hasProfile: boolean;
  name: string;
  location: string;
  industry: string;
  kind: ProfileKind | null;
  bio: string;
  /** About continuation (`profile/about`). */
  about: string;
  /** About lead above the film (`profile/lead`). */
  lead: string;
  /** More for About essay alignment (`profile/aboutAlign`). */
  aboutAlign: ProfileAboutAlign;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerMedia: ResolvedPageHero | null;
  links: MaterialisedProfile['links'];
  pageConfig: PublicPageConfig;
  tags: string[];
  photos: ProfileAboutPhoto[];
  /** Increments on each profile read that is still the newest request. */
  loadId?: number;
}

export interface ProfileEditorSaveInput {
  name: string;
  location: string;
  industry: string;
  kind: ProfileKind;
  bio: string;
  about: string;
  lead: string;
  aboutAlign: ProfileAboutAlign;
  avatar: File | null;
  banner: File | null;
  removeAvatar: boolean;
  removeBanner: boolean;
  links: ProfileLinksInput;
  currentLinks: MaterialisedProfile['links'];
  hasCurrentLinks: boolean;
  hasLinkInput: boolean;
  linkNotes: Record<string, string>;
  /** Set on the portfolio editor. DAO saves omit this and keep one website field. */
  websites?: PortfolioWebsiteDraft[];
  tags: string[];
  photos: ProfileAboutPhoto[];
  photoFiles: Array<File | null>;
  isDao?: boolean;
}

export interface ProfileEditorSaveResult {
  name: string;
  location: string;
  industry: string;
  kind: ProfileKind;
  bio: string;
  about: string;
  lead: string;
  aboutAlign: ProfileAboutAlign;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerMedia: ResolvedPageHero | null;
  txHash?: string | null;
  /** True when save found nothing to write. The sheet closes without a saved toast. */
  unchanged?: boolean;
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
  const { getClient } = useAppOnSocialClient();
  const [snapshot, setSnapshot] = useState<ProfileEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const loadSerial = useRef(0);

  const loadProfile = useCallback(async () => {
    if (!accountId) {
      loadRequest.current += 1;
      setSnapshot(null);
      setLoading(false);
      setLoadError(null);
      return;
    }

    const requestId = ++loadRequest.current;
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

      if (requestId !== loadRequest.current) return;

      if (!response.ok) {
        throw new Error(
          body && 'error' in body && body.error
            ? body.error
            : 'Could not load profile.'
        );
      }

      setSnapshot({
        ...(body as ProfileEditorSnapshot),
        loadId: ++loadSerial.current,
        pageConfig: (body as ProfileEditorSnapshot).pageConfig ?? {},
        tags: Array.isArray((body as ProfileEditorSnapshot).tags)
          ? (body as ProfileEditorSnapshot).tags
          : [],
        photos: Array.isArray((body as ProfileEditorSnapshot).photos)
          ? (body as ProfileEditorSnapshot).photos
          : [],
        about:
          typeof (body as ProfileEditorSnapshot).about === 'string'
            ? (body as ProfileEditorSnapshot).about
            : '',
        lead:
          typeof (body as ProfileEditorSnapshot).lead === 'string'
            ? (body as ProfileEditorSnapshot).lead
            : '',
        aboutAlign: normalizeProfileAboutAlign(
          (body as ProfileEditorSnapshot).aboutAlign
        ),
      });
    } catch (err) {
      if (requestId !== loadRequest.current) return;
      setSnapshot(null);
      setLoadError(formatProfileEditorError(err, 'Could not load profile.'));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!enabled) {
      loadRequest.current += 1;
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
        throw new Error(connectBefore('saving a profile'));
      }

      const name = normalizeProfileEditorName(input.name);
      if (!name) {
        throw new Error('Profile name is required.');
      }

      const location = normalizeProfileLocationInput(input.location);
      const lead = normalizeProfileLeadInput(input.lead);
      const aboutAlign = normalizeProfileAboutAlign(input.aboutAlign);
      const faceKind = editorFaceKind(input.kind);
      const isDao = Boolean(input.isDao);
      const storesIndustry = isDao || faceKind === 'org';
      const industry = storesIndustry
        ? normalizeProfileIndustryInput(input.industry)
        : '';
      const snapshotNow = snapshot;
      if (!snapshotNow || snapshotNow.accountId !== accountId) {
        throw new Error('Could not load profile.');
      }

      const savedWebsites = input.websites
        ? readPortfolioWebsites(
            snapshotNow.links,
            snapshotNow.pageConfig?.linkNotes,
            snapshotNow.pageConfig?.linkLines,
            snapshotNow.pageConfig?.linkImages
          )
        : undefined;
      const normalizedLinks = normalizeProfileLinksInput(
        input.websites ? { ...input.links, website: '' } : input.links,
        input.currentLinks ?? undefined
      );
      const websitePlan = input.websites
        ? applyPortfolioWebsites({
            links: normalizedLinks,
            notes: input.linkNotes,
            websites: input.websites,
          })
        : null;
      const linksToSave = websitePlan?.links ?? normalizedLinks;
      const nextNotes =
        websitePlan?.notes ?? pruneLinkNotes(input.linkNotes, input.links);
      const nextLines = websitePlan?.lines;
      const notesDirty = !linkNotesEqual(
        nextNotes,
        snapshotNow.pageConfig?.linkNotes
      );
      const linesDirty = websitePlan
        ? !linkNotesEqual(nextLines, snapshotNow.pageConfig?.linkLines)
        : false;
      const nextImages = websitePlan?.images;
      const imagesDirty = websitePlan
        ? Boolean(input.websites?.some((row) => row.imageFile)) ||
          !linkImagesEqual(nextImages, snapshotNow.pageConfig?.linkImages)
        : false;
      const contentDirty = isProfileEditorContentDirty({
        snapshot: snapshotNow,
        linksFromSnapshot: profileLinksInputFromRecord(snapshotNow.links),
        name,
        location,
        industry,
        kind: faceKind,
        bio: input.bio,
        about: input.about,
        lead,
        aboutAlign,
        links: input.links,
        websites: input.websites,
        websitesFromSnapshot: savedWebsites,
        tags: input.tags,
        photos: input.photos,
        photoFiles: input.photoFiles,
        avatarFile: input.avatar,
        bannerFile: input.banner,
        avatarRemoved: input.removeAvatar,
        bannerRemoved: input.removeBanner,
        isDao,
      });

      if (!contentDirty && !notesDirty && !linesDirty && !imagesDirty) {
        return {
          name,
          location,
          industry,
          kind: faceKind,
          bio: input.bio.trim(),
          about: input.about.trim(),
          lead,
          aboutAlign,
          avatarUrl: snapshotNow.avatarUrl,
          bannerUrl: snapshotNow.bannerUrl,
          bannerMedia: snapshotNow.bannerMedia,
          txHash: null,
          unchanged: true,
        };
      }

      setSaving(true);

      try {
        const {
          client,
          accountId: signingAccountId,
          session,
        } = await getClient();
        if (linksToSave.onsocial) {
          const exists = await probeNearAccountExists(linksToSave.onsocial);
          if (!exists) {
            throw new Error(
              'OnSocial link account was not found on this network'
            );
          }
        }
        let imagesToSave = nextImages;
        if (input.websites?.some((row) => row.imageFile)) {
          const uploaded: PortfolioWebsiteDraft[] = [];
          for (const row of input.websites) {
            if (!row.imageFile) {
              uploaded.push(row);
              continue;
            }
            const stored = await client.storage.upload(row.imageFile);
            uploaded.push({
              ...row,
              image: formatProfileMediaRef(stored),
              imageFile: null,
            });
          }
          imagesToSave = applyPortfolioWebsites({
            links: normalizedLinks,
            notes: input.linkNotes,
            websites: uploaded,
          }).images;
        }
        const hasWebsiteInput = Boolean(
          input.websites?.some(
            (row) =>
              row.url.trim() ||
              row.name.trim() ||
              row.line.trim() ||
              row.image?.trim() ||
              row.imageFile
          )
        );
        const shouldSaveLinks =
          input.hasCurrentLinks ||
          input.hasLinkInput ||
          hasWebsiteInput ||
          Object.keys(linksToSave).length > 0;

        let txHash: string | null = null;

        if (contentDirty) {
          const payload: Parameters<typeof client.profiles.update>[0] = {
            name,
            bio: input.bio.trim(),
            about: input.about.trim() || null,
            lead: lead || null,
            aboutAlign,
            location: location || null,
            ...(isDao
              ? { kind: 'dao', industry: industry || null }
              : {
                  kind: faceKind === 'org' ? 'org' : null,
                  industry: faceKind === 'org' ? industry || null : null,
                }),
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
            payload.links = linksToSave;
          }
          payload.tags = normalizeProfileEditorTags(input.tags);

          const nextPhotoRefs: string[] = [];
          for (let index = 0; index < input.photos.length; index += 1) {
            const file = input.photoFiles[index];
            if (file) {
              const uploaded = await client.storage.upload(file);
              nextPhotoRefs.push(formatProfileMediaRef(uploaded));
              continue;
            }
            const ref = input.photos[index]?.ref?.trim();
            if (ref) nextPhotoRefs.push(ref);
          }
          const savedPhotoRefs = snapshotNow.photos.map((photo) => photo.ref);
          if (!profileAboutPhotoRefsEqual(nextPhotoRefs, savedPhotoRefs)) {
            payload.photos = parseProfileAboutPhotoRefs(nextPhotoRefs);
          }

          // Bio save also writes hashtags/tickers/mentions via SDK extract-on-save.
          const response = await client.profiles.update(payload, {
            wait: true,
          });
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

        if (notesDirty || linesDirty || imagesDirty) {
          const current =
            await fetchPageConfigFromBrowserProxy(signingAccountId);
          const notes = sanitizeLinkNotes(nextNotes);
          const next: PageConfig = {
            ...((snapshotNow.pageConfig ?? {}) as PageConfig),
            ...current,
            linkNotes: Object.keys(notes).length > 0 ? notes : undefined,
          };
          if (websitePlan) {
            const lines = sanitizeLinkNotes(nextLines);
            next.linkLines = Object.keys(lines).length > 0 ? lines : undefined;
            const images = sanitizeLinkImages(imagesToSave);
            next.linkImages =
              Object.keys(images).length > 0 ? images : undefined;
            delete (next as { linkMarks?: unknown }).linkMarks;
          }
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
          location,
          industry,
          kind: faceKind,
          bio: input.bio.trim(),
          about: input.about.trim(),
          lead,
          aboutAlign,
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
    linksFromSnapshot: profileLinksInputFromRecord(snapshot?.links),
  };
}
