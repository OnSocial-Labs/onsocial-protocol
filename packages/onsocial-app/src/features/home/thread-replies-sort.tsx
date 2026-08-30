'use client';

import { useState } from 'react';
import {
  ActionDrawer,
  CheckIcon,
  ChevronDownIcon,
  type ActionDrawerItem,
} from '@onsocial/ui';
import {
  THREAD_REPLY_SORT_OPTIONS,
  type ThreadReplySort,
} from '@/lib/thread-reply-sort';

interface ThreadRepliesSortButtonProps {
  sort: ThreadReplySort;
  onChange: (sort: ThreadReplySort) => void;
}

/**
 * `Replies ▾` — quiet section control on the thread controls row; opens the
 * sort drawer (Relevant / Trending / Recent). Ranked sorts flatten the tree.
 */
export function ThreadRepliesSortButton({
  sort,
  onChange,
}: ThreadRepliesSortButtonProps) {
  const [open, setOpen] = useState(false);

  const items: ActionDrawerItem[] = THREAD_REPLY_SORT_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
    trailing:
      sort === option.id ? (
        <CheckIcon className="os-action-drawer-icon" aria-hidden />
      ) : undefined,
    onSelect: () => {
      onChange(option.id);
      setOpen(false);
    },
  }));

  return (
    <>
      <button
        type="button"
        className="thread-replies-sort"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Replies
        <ChevronDownIcon className="thread-replies-sort-chevron" aria-hidden />
      </button>
      <ActionDrawer
        open={open}
        onClose={() => setOpen(false)}
        label="Sort replies"
        items={items}
      />
    </>
  );
}
