'use client';

import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import {
  ImageIcon,
  MessageRoundIcon,
  NoteTextIcon,
  RepeatIcon,
  SheetCloseButton,
} from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import {
  ProfileFeedClient,
  type ProfileFeedTab,
} from '@/features/home/profile-feed-client';

const FEED_TAB_PARAM = 'tab';

function isProfileFeedTab(value: string | null): value is ProfileFeedTab {
  return (
    value === 'posts' ||
    value === 'replies' ||
    value === 'reposts' ||
    value === 'media'
  );
}

/**
 * Tab state mirrored into `?tab=` so sections stay shareable in the overlay.
 * Shallow `history.replaceState` — the tab is client state, no server trip.
 */
function useProfileFeedTabParam(): [
  ProfileFeedTab,
  (tab: ProfileFeedTab) => void,
] {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get(FEED_TAB_PARAM);
  const [tab, setTab] = useState<ProfileFeedTab>(
    isProfileFeedTab(fromUrl) ? fromUrl : 'posts'
  );

  const selectTab = useCallback((next: ProfileFeedTab) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === 'posts') params.delete(FEED_TAB_PARAM);
    else params.set(FEED_TAB_PARAM, next);
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  }, []);

  return [tab, selectTab];
}

const FEED_TAB_ITEMS: ReadonlyArray<{
  id: ProfileFeedTab;
  label: string;
  Icon: typeof NoteTextIcon;
}> = [
  { id: 'posts', label: 'Posts', Icon: NoteTextIcon },
  { id: 'replies', label: 'Replies', Icon: MessageRoundIcon },
  { id: 'reposts', label: 'Reposts', Icon: RepeatIcon },
  { id: 'media', label: 'Media', Icon: ImageIcon },
];

function ProfileFeedTabsRail({
  tab,
  onTabChange,
}: {
  tab: ProfileFeedTab;
  onTabChange: (tab: ProfileFeedTab) => void;
}) {
  return (
    <OsChipRail
      ariaLabel="Profile feed sections"
      className="discover-tab-bar--header profile-feed-tab-bar"
      value={tab}
      onValueChange={onTabChange}
      tabIdFor={(option) => `profile-feed-tab-${option}`}
      items={FEED_TAB_ITEMS.map(({ id, label, Icon }) => ({
        id,
        label: (
          <>
            <Icon className="profile-feed-tab-icon" aria-hidden />
            <span className="profile-feed-tab-label">
              <span>{label}</span>
            </span>
          </>
        ),
      }))}
    />
  );
}

function ProfileFeedSheetHeader({
  tab,
  onTabChange,
}: {
  tab: ProfileFeedTab;
  onTabChange: (tab: ProfileFeedTab) => void;
}) {
  const close = useOverlayDismiss();

  return (
    <div className="standing-sheet-header profile-feed-sheet-header">
      <div className="discover-sheet-title-row">
        <ProfileFeedTabsRail tab={tab} onTabChange={onTabChange} />
        <SheetCloseButton onClick={close} ariaLabel="Close Feed" />
      </div>
    </div>
  );
}

/** Profile feed overlay — compact section tabs + close. */
export function ProfileFeedOverlayPanel({
  accountId,
  posts,
  postCount,
}: {
  accountId: string;
  posts: PostRow[];
  postCount: number;
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useProfileFeedTabParam();

  return (
    <>
      <OverlayPanelChrome
        ariaTitle="Feed"
        toolbar={
          <ProfileFeedSheetHeader tab={tab} onTabChange={setTab} />
        }
        scrollBodyRef={scrollRootRef}
        showHeaderDivider={false}
      />
      <ProfileFeedClient
        accountId={accountId}
        posts={posts}
        postCount={postCount}
        tab={tab}
      />
    </>
  );
}
