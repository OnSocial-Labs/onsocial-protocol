import {
  normalizeProfileAboutAlign,
  type ProfileAboutAlign,
  type ProfileKind,
} from '@onsocial/sdk';
import type { ProfileEditorSnapshot } from '@/hooks/use-app-profile-editor';
import { linkNotesEqual, pruneLinkNotes } from '@/lib/page-launch-config';
import {
  profileAboutPhotoRefsEqual,
  type ProfileAboutPhoto,
} from '@/lib/profile-about-photos';
import {
  PROFILE_LINK_EDITOR_FIELDS,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { profileEditorTagsEqual } from '@/lib/profile-tag-editor';

export function isProfileEditorContentDirty(input: {
  snapshot: ProfileEditorSnapshot;
  linksFromSnapshot: ProfileLinksInput;
  name: string;
  location: string;
  industry: string;
  kind: ProfileKind;
  bio: string;
  about: string;
  lead: string;
  aboutAlign: ProfileAboutAlign;
  links: ProfileLinksInput;
  tags: string[];
  photos: ProfileAboutPhoto[];
  photoFiles: Array<File | null>;
  avatarFile: File | null;
  bannerFile: File | null;
  avatarRemoved: boolean;
  bannerRemoved: boolean;
  /** Protocol DAO workspace — industry is a face field, kind is not a pick. */
  isDao?: boolean;
}): boolean {
  if (input.avatarFile || input.bannerFile) {
    return true;
  }

  if (input.avatarRemoved && input.snapshot.avatarUrl) {
    return true;
  }

  if (input.bannerRemoved && input.snapshot.bannerUrl) {
    return true;
  }

  if (input.name.trim() !== input.snapshot.name.trim()) {
    return true;
  }

  if (input.location.trim() !== input.snapshot.location.trim()) {
    return true;
  }

  if (input.kind !== (input.snapshot.kind === 'org' ? 'org' : 'person')) {
    return true;
  }

  const storesIndustry = Boolean(input.isDao) || input.kind === 'org';
  const snapshotStoresIndustry =
    Boolean(input.isDao) || input.snapshot.kind === 'org';
  if (
    (storesIndustry ? input.industry.trim() : '') !==
    (snapshotStoresIndustry ? (input.snapshot.industry ?? '').trim() : '')
  ) {
    return true;
  }

  if (input.bio.trim() !== input.snapshot.bio.trim()) {
    return true;
  }

  if (input.about.trim() !== (input.snapshot.about ?? '').trim()) {
    return true;
  }

  if (input.lead.trim() !== (input.snapshot.lead ?? '').trim()) {
    return true;
  }

  if (
    normalizeProfileAboutAlign(input.aboutAlign) !==
    normalizeProfileAboutAlign(input.snapshot.aboutAlign)
  ) {
    return true;
  }

  if (!profileEditorTagsEqual(input.tags, input.snapshot.tags)) {
    return true;
  }

  if (input.photoFiles.some(Boolean)) {
    return true;
  }

  if (
    !profileAboutPhotoRefsEqual(
      input.photos.map((photo) => photo.ref),
      (input.snapshot.photos ?? []).map((photo) => photo.ref)
    )
  ) {
    return true;
  }

  for (const field of PROFILE_LINK_EDITOR_FIELDS) {
    if (
      input.links[field.key].trim() !==
      input.linksFromSnapshot[field.key].trim()
    ) {
      return true;
    }
  }

  return false;
}

export function isProfileEditorDirty(input: {
  snapshot: ProfileEditorSnapshot;
  linksFromSnapshot: ProfileLinksInput;
  name: string;
  location: string;
  industry: string;
  kind: ProfileKind;
  bio: string;
  about: string;
  lead: string;
  aboutAlign: ProfileAboutAlign;
  links: ProfileLinksInput;
  tags: string[];
  photos: ProfileAboutPhoto[];
  photoFiles: Array<File | null>;
  linkNotes: Record<string, string>;
  avatarFile: File | null;
  bannerFile: File | null;
  avatarRemoved: boolean;
  bannerRemoved: boolean;
  isDao?: boolean;
}): boolean {
  if (isProfileEditorContentDirty(input)) {
    return true;
  }

  return !linkNotesEqual(
    pruneLinkNotes(input.linkNotes, input.links),
    input.snapshot.pageConfig?.linkNotes
  );
}
