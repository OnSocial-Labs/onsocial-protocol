import type { ProfileEditorSnapshot } from '@/hooks/use-app-profile-editor';
import {
  PROFILE_LINK_EDITOR_FIELDS,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import {
  profileEditorTagsEqual,
} from '@/lib/profile-tag-editor';
export function isProfileEditorDirty(input: {
  snapshot: ProfileEditorSnapshot;
  linksFromSnapshot: ProfileLinksInput;
  tagsFromSnapshot: string[];
  name: string;
  bio: string;
  links: ProfileLinksInput;
  tags: string[];
  avatarFile: File | null;
  bannerFile: File | null;
  avatarRemoved: boolean;
  bannerRemoved: boolean;
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

  if (input.bio.trim() !== input.snapshot.bio.trim()) {
    return true;
  }

  if (!profileEditorTagsEqual(input.tags, input.tagsFromSnapshot)) {
    return true;
  }

  for (const field of PROFILE_LINK_EDITOR_FIELDS) {
    if (
      input.links[field.key].trim() !== input.linksFromSnapshot[field.key].trim()
    ) {
      return true;
    }
  }

  return false;
}
