'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MaterialisedProfile,
  ProfileData,
  RelayResponse,
} from '@onsocial/sdk';
import {
  bootstrapSession,
  localStorageKeyStore,
  nearConnectAdapter,
  restoreSession,
  type Session,
} from '@onsocial/sdk/advanced';
import { useWallet } from '@/contexts/wallet-context';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';

const SOCIAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SOCIAL_SESSION_ALLOWANCE_YOCTO = '250000000000000000000000';
const INDEXED_PROFILE_REFRESH_DELAYS_MS = [750, 2_000, 5_000] as const;
const PORTAL_ONAPI_PROXY_URL = '/api/onapi';

export interface ProfileSaveInput
  extends Omit<ProfileData, 'name' | 'bio' | 'avatar' | 'banner'> {
  name: string;
  bio?: string;
  avatar?: string | Blob | File | null;
  banner?: string | Blob | File | null;
}

export interface ProfileSaveResult {
  profile: MaterialisedProfile | null;
  response: RelayResponse;
}

export interface StandingUpdateResult {
  applied: boolean;
  response: RelayResponse;
}

interface PortalProfileResponse {
  accountId: string;
  profile: MaterialisedProfile | null;
  indexedProfile: Record<string, string> | null;
  avatarUrl: string | null;
}

interface ProfileRefreshExpectation {
  fields: Record<string, string>;
  pendingBlobFields: Record<string, string | undefined>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Profile request failed';
}

function hasProfileFields(profile: MaterialisedProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.name?.trim() ||
      profile.bio?.trim() ||
      profile.avatar ||
      profile.banner ||
      Object.keys(profile.extra).length > 0
  );
}

function isBlobLike(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function encodeProfileField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function buildProfileRefreshExpectation(
  payload: ProfileData,
  current: MaterialisedProfile | null
): ProfileRefreshExpectation {
  const fields: Record<string, string> = {};
  const pendingBlobFields: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (isBlobLike(value)) {
      pendingBlobFields[key] = getMaterialisedProfileField(current, key);
      continue;
    }
    const encoded = encodeProfileField(value);
    if (encoded !== undefined) fields[key] = encoded;
  }

  return { fields, pendingBlobFields };
}

function buildOptimisticProfile(
  accountId: string,
  current: MaterialisedProfile | null,
  expected: ProfileRefreshExpectation,
  previewFields: Record<string, string> = {}
): MaterialisedProfile {
  const extra = { ...(current?.extra ?? {}) };
  const next: MaterialisedProfile = {
    ...(current ?? { extra: {} }),
    accountId,
    extra,
  };

  for (const [key, value] of Object.entries(expected.fields)) {
    switch (key) {
      case 'name':
        next.name = value;
        break;
      case 'bio':
        next.bio = value;
        break;
      case 'avatar':
        next.avatar = value;
        break;
      case 'banner':
        next.banner = value;
        break;
      case 'links':
        next.links = JSON.parse(value) as Record<string, string>;
        break;
      case 'tags':
        next.tags = JSON.parse(value) as string[];
        break;
      default:
        extra[key] = value;
        break;
    }
  }

  for (const [key, value] of Object.entries(previewFields)) {
    switch (key) {
      case 'avatar':
        next.avatar = value;
        break;
      case 'banner':
        next.banner = value;
        break;
      default:
        extra[key] = value;
        break;
    }
  }

  return next;
}

function buildOptimisticIndexedProfile(
  current: Record<string, string> | null,
  expected: ProfileRefreshExpectation
): Record<string, string> {
  return {
    ...(current ?? {}),
    ...expected.fields,
  };
}

function getMaterialisedProfileField(
  profile: MaterialisedProfile | null,
  key: string
): string | undefined {
  if (!profile) return undefined;
  switch (key) {
    case 'name':
      return profile.name;
    case 'bio':
      return profile.bio ?? '';
    case 'avatar':
      return profile.avatar;
    case 'banner':
      return profile.banner;
    case 'links':
      return profile.links ? JSON.stringify(profile.links) : undefined;
    case 'tags':
      return profile.tags ? JSON.stringify(profile.tags) : undefined;
    default:
      return profile.extra[key];
  }
}

function profileMatchesExpected(
  profile: MaterialisedProfile | null,
  expected: ProfileRefreshExpectation
): boolean {
  if (!profile) return false;
  const fieldsMatch = Object.entries(expected.fields).every(
    ([key, value]) => getMaterialisedProfileField(profile, key) === value
  );
  const blobFieldsMatch = Object.entries(expected.pendingBlobFields).every(
    ([key, previousValue]) => {
      const nextValue = getMaterialisedProfileField(profile, key);
      return Boolean(nextValue) && nextValue !== previousValue;
    }
  );
  return fieldsMatch && blobFieldsMatch;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSocialSessionPath(accountId: string): string {
  return `${accountId}/`;
}

function getSocialSessionStore() {
  return localStorageKeyStore('onsocial.portal.session.');
}

async function restoreSocialSession(
  accountId: string
): Promise<Session | null> {
  return restoreSession({
    store: getSocialSessionStore(),
    accountId,
    contract: 'core',
    path: getSocialSessionPath(accountId),
    startingNonce: Date.now(),
    remainingAllowanceYocto: SOCIAL_SESSION_ALLOWANCE_YOCTO,
  });
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
    indexedProfile: body?.indexedProfile ?? null,
    avatarUrl: body?.avatarUrl ?? null,
  };
}

export function useProfile() {
  const { accountId, wallet, isConnected } = useWallet();
  const [profile, setProfile] = useState<MaterialisedProfile | null>(null);
  const [indexedProfile, setIndexedProfile] = useState<Record<
    string,
    string
  > | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStanding, setIsUpdatingStanding] = useState(false);
  const [isAuthorizingSession, setIsAuthorizingSession] = useState(false);
  const [hasSocialSession, setHasSocialSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestLoadRef = useRef(0);
  const latestIndexedRefreshRef = useRef(0);
  const activeAccountIdRef = useRef<string | null>(null);
  const optimisticMediaUrlsRef = useRef<Record<string, string>>({});

  const revokeOptimisticMediaUrl = useCallback((field: string) => {
    const current = optimisticMediaUrlsRef.current[field];
    if (current) {
      URL.revokeObjectURL(current);
      delete optimisticMediaUrlsRef.current[field];
    }
  }, []);

  const setResolvedAvatarUrl = useCallback(
    (nextAvatarUrl: string | null) => {
      revokeOptimisticMediaUrl('avatar');
      setAvatarUrl(nextAvatarUrl);
    },
    [revokeOptimisticMediaUrl]
  );

  const createOptimisticMediaPreviews = useCallback(
    (payload: ProfileData) => {
      const previews: Record<string, string> = {};

      for (const [field, value] of Object.entries(payload)) {
        if (isBlobLike(value)) {
          revokeOptimisticMediaUrl(field);
          const nextUrl = URL.createObjectURL(value);
          optimisticMediaUrlsRef.current[field] = nextUrl;
          previews[field] = nextUrl;
        } else if (typeof value === 'string' || value === null) {
          revokeOptimisticMediaUrl(field);
        }
      }

      return previews;
    },
    [revokeOptimisticMediaUrl]
  );

  const resolveCanonicalMediaPreviews = useCallback(() => {
    for (const field of Object.keys(optimisticMediaUrlsRef.current)) {
      revokeOptimisticMediaUrl(field);
    }
  }, [revokeOptimisticMediaUrl]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(optimisticMediaUrlsRef.current)) {
        if (url) URL.revokeObjectURL(url);
      }
      optimisticMediaUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (activeAccountIdRef.current === accountId) return;

    activeAccountIdRef.current = accountId ?? null;
    latestLoadRef.current += 1;
    latestIndexedRefreshRef.current += 1;
    resolveCanonicalMediaPreviews();
    setProfile(null);
    setIndexedProfile(null);
    setResolvedAvatarUrl(null);
    setError(null);
    setHasSocialSession(false);
  }, [accountId, resolveCanonicalMediaPreviews, setResolvedAvatarUrl]);

  const createClient = useCallback(
    () => createPortalOnSocialClient({ gatewayUrl: PORTAL_ONAPI_PROXY_URL }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    if (!accountId || !isConnected) {
      setHasSocialSession(false);
      return () => {
        cancelled = true;
      };
    }

    void restoreSocialSession(accountId)
      .then((restored) => {
        if (!cancelled) setHasSocialSession(Boolean(restored));
      })
      .catch(() => {
        if (!cancelled) setHasSocialSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, isConnected]);

  const getSocialSession = useCallback(async (): Promise<Session> => {
    if (!accountId || !wallet) {
      throw new Error(
        'Connect your wallet before authorizing an OnSocial session.'
      );
    }

    const restored = await restoreSocialSession(accountId);

    if (restored) {
      setHasSocialSession(true);
      return restored;
    }

    setIsAuthorizingSession(true);
    try {
      const session = await bootstrapSession({
        wallet: nearConnectAdapter(wallet, accountId, {
          network: ACTIVE_NEAR_NETWORK,
        }),
        accountId,
        network: ACTIVE_NEAR_NETWORK,
        contract: 'core',
        path: getSocialSessionPath(accountId),
        ttlMs: SOCIAL_SESSION_TTL_MS,
        functionCallKey: {
          methodNames: ['execute'],
          allowanceYocto: SOCIAL_SESSION_ALLOWANCE_YOCTO,
        },
        storageDepositYocto: '0',
        store: getSocialSessionStore(),
      });
      setHasSocialSession(true);
      return session;
    } finally {
      setIsAuthorizingSession(false);
    }
  }, [accountId, wallet]);

  const loadProfile = useCallback(async () => {
    if (!accountId || !isConnected) {
      setProfile(null);
      setIndexedProfile(null);
      setResolvedAvatarUrl(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    const loadId = latestLoadRef.current + 1;
    latestLoadRef.current = loadId;
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchPortalProfile(accountId);
      if (latestLoadRef.current === loadId) {
        setProfile(result.profile);
        setIndexedProfile(result.indexedProfile);
        setResolvedAvatarUrl(result.avatarUrl);
      }
      return result.profile;
    } catch (err) {
      if (latestLoadRef.current === loadId) {
        setError(getErrorMessage(err));
        setProfile(null);
        setIndexedProfile(null);
        setResolvedAvatarUrl(null);
      }
      return null;
    } finally {
      if (latestLoadRef.current === loadId) {
        setIsLoading(false);
      }
    }
  }, [accountId, isConnected, setResolvedAvatarUrl]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const refreshIndexedProfileWhenReady = useCallback(
    (accountId: string, expected: ProfileRefreshExpectation) => {
      const refreshId = latestIndexedRefreshRef.current + 1;
      latestIndexedRefreshRef.current = refreshId;

      void (async () => {
        for (const delayMs of INDEXED_PROFILE_REFRESH_DELAYS_MS) {
          await delay(delayMs);
          if (latestIndexedRefreshRef.current !== refreshId) return;

          try {
            const result = await fetchPortalProfile(accountId);
            if (latestIndexedRefreshRef.current !== refreshId) return;

            if (profileMatchesExpected(result.profile, expected)) {
              setProfile(result.profile);
              setIndexedProfile(result.indexedProfile);
              resolveCanonicalMediaPreviews();
              setResolvedAvatarUrl(result.avatarUrl);
              return;
            }
          } catch {
            // Keep the optimistic profile if background revalidation is slow.
          }
        }
      })();
    },
    [resolveCanonicalMediaPreviews, setResolvedAvatarUrl]
  );

  const saveProfile = useCallback(
    async (input: ProfileSaveInput): Promise<ProfileSaveResult> => {
      if (!accountId || !isConnected || !wallet) {
        throw new Error('Connect your wallet before saving a profile.');
      }

      const {
        name: inputName,
        bio: inputBio,
        avatar,
        banner,
        ...customFields
      } = input;
      const name = inputName.trim();
      const bio = inputBio?.trim() ?? '';
      if (!name) {
        throw new Error('Profile name is required.');
      }

      setIsSaving(true);
      setError(null);

      try {
        const os = createClient();
        const session = await getSocialSession();
        os.attachSession(session);
        const payload: ProfileData = {
          ...customFields,
          name,
          bio,
        };

        if (avatar) {
          payload.avatar = avatar;
        }
        if (banner) {
          payload.banner = banner;
        }

        const currentProfile =
          profile?.accountId === accountId ? profile : null;
        const response = await os.profiles.update(payload);
        const expected = buildProfileRefreshExpectation(
          payload,
          currentProfile
        );
        const optimisticMediaPreviews = createOptimisticMediaPreviews(payload);
        const optimisticProfile = buildOptimisticProfile(
          accountId,
          currentProfile,
          expected,
          optimisticMediaPreviews
        );
        setProfile(optimisticProfile);
        setIndexedProfile((current) =>
          buildOptimisticIndexedProfile(current, expected)
        );
        if (optimisticMediaPreviews.avatar) {
          setAvatarUrl(optimisticMediaPreviews.avatar);
        } else if (typeof avatar === 'string') {
          setResolvedAvatarUrl(os.profiles.avatarUrl(optimisticProfile));
        }
        refreshIndexedProfileWhenReady(accountId, expected);
        return { profile: optimisticProfile, response };
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [
      accountId,
      createOptimisticMediaPreviews,
      createClient,
      getSocialSession,
      isConnected,
      profile,
      refreshIndexedProfileWhenReady,
      setResolvedAvatarUrl,
      wallet,
    ]
  );

  const updateStanding = useCallback(
    async (
      targetAccount: string,
      shouldStand: boolean
    ): Promise<StandingUpdateResult> => {
      if (!accountId || !isConnected || !wallet) {
        throw new Error('Connect your wallet before updating standing.');
      }
      if (targetAccount === accountId) {
        throw new Error('You cannot stand with your own account.');
      }

      setIsUpdatingStanding(true);
      setError(null);

      try {
        const os = createClient();
        const session = await getSocialSession();
        os.attachSession(session);
        const response = shouldStand
          ? await os.standings.add(targetAccount)
          : await os.standings.remove(targetAccount);
        return { applied: shouldStand, response };
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        throw new Error(message);
      } finally {
        setIsUpdatingStanding(false);
      }
    },
    [accountId, createClient, getSocialSession, isConnected, wallet]
  );

  const visibleProfile = profile?.accountId === accountId ? profile : null;
  const visibleIndexedProfile = visibleProfile ? indexedProfile : null;
  const visibleAvatarUrl = visibleProfile ? avatarUrl : null;

  return {
    accountId,
    profile: visibleProfile,
    indexedProfile: visibleIndexedProfile,
    avatarUrl: visibleAvatarUrl,
    hasProfile: hasProfileFields(visibleProfile),
    isLoading,
    isSaving,
    isUpdatingStanding,
    isAuthorizingSession,
    hasSocialSession,
    error,
    refreshProfile: loadProfile,
    saveProfile,
    updateStanding,
  };
}
