'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { OsWriteDockReplyChip } from '@/components/os/os-write-dock';
import {
  useFocusWriteDock,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { useReplyWriteDock } from '@/hooks/use-reply-write-dock';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  WRITE_DOCK_ADD_REPLY_PLACEHOLDER,
  writeDockDraftKey,
} from '@/lib/os-write-dock';
import { clearWriteDockDraft } from '@/lib/os-write-dock-draft';
import { postKey } from '@/lib/post-display';

export function useFeedReplyWriteDock({
  enabled,
  sheetOpen,
  authorNameFor,
  onExpand,
  onConfirmed,
}: {
  enabled?: boolean;
  sheetOpen: boolean;
  authorNameFor?: (accountId: string) => string | null | undefined;
  onExpand: (target: PostRow, payload: WriteDockSubmit) => void;
  onConfirmed?: (reply: PostRow, target: PostRow) => void;
}) {
  const [target, setTarget] = useState<PostRow | null>(null);
  const focusWriteDock = useFocusWriteDock();

  const startReply = useCallback(
    (post: PostRow) => {
      setTarget(post);
      queueMicrotask(() => focusWriteDock());
    },
    [focusWriteDock]
  );

  const clearReply = useCallback(() => {
    setTarget((current) => {
      if (current) {
        clearWriteDockDraft(writeDockDraftKey('post', postKey(current)));
      }
      return null;
    });
  }, []);

  const fetchedProfiles = usePostAuthorProfiles(
    target ? [target.accountId] : []
  );
  const name = !target
    ? null
    : (authorNameFor?.(target.accountId) ??
      fetchedProfiles[target.accountId]?.displayName);
  const above = useMemo(() => {
    if (!target) return null;
    return (
      <OsWriteDockReplyChip
        label={name?.trim() || 'this post'}
        onCancel={clearReply}
      />
    );
  }, [clearReply, name, target]);

  const handleExpand = useCallback(
    (payload: WriteDockSubmit) => {
      if (!target) return;
      onExpand(target, payload);
    },
    [onExpand, target]
  );

  useReplyWriteDock({
    target,
    enabled: (enabled ?? true) && Boolean(target) && !sheetOpen,
    placeholder: WRITE_DOCK_ADD_REPLY_PLACEHOLDER,
    above,
    revision: target ? postKey(target) : '',
    draftKey: target ? writeDockDraftKey('post', postKey(target)) : undefined,
    onExpand: target ? handleExpand : undefined,
    onConfirmed: (reply, confirmedTarget) => {
      onConfirmed?.(reply, confirmedTarget);
      setTarget(null);
    },
  });

  return { startReply, clearReply, replyTarget: target };
}
