'use client';

import React, { createContext, useContext, type ReactNode } from 'react';
import { useProfileState } from '@/hooks/use-profile';

export type {
  ProfileSaveInput,
  ProfileSaveResult,
  StandingUpdateResult,
} from '@/hooks/use-profile';

type ProfileState = ReturnType<typeof useProfileState>;

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const state = useProfileState();
  return (
    <ProfileContext.Provider value={state}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return ctx;
}
