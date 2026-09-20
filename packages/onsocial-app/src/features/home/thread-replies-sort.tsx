'use client';

import { useState } from 'react';
import {
  ActionDrawer,
  CheckIcon,
  ChevronDownIcon,
  type ActionDrawerItem,
} from '@onsocial/ui';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  THREAD_REPLY_SORT_OPTIONS,
  type ThreadReplySort,
} from '@/lib/thread-reply-sort';

interface ThreadRepliesSortButtonProps {
  sort: ThreadReplySort;
  onChange: (sort: ThreadReplySort) => void;
  zIndex?: number;
}

/**
 * `Replies ▾` — quiet section control on the thread controls row; opens the
 * sort drawer (Relevant / Trending / Recent). Ranked sorts flatten the tree.
 *
 * Above the Reply / enlarge face (80) and write dock (95) — nested-choice
 * band (130). First post/drop sheets stay at 50 so this list can sit on them.
 */
export function ThreadRepliesSortButton({
  sort,
  onChange,
  zIndex = SHEET_Z.overlayNested,
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
        aria-label="Sort replies"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        Replies
        <ChevronDownIcon className="thread-replies-sort-chevron" aria-hidden />
      </button>
      <ActionDrawer
        open={open}
        onClose={() => setOpen(false)}
        label="Replies"
        items={items}
        zIndex={zIndex}
        keepDock
      />
    </>
  );
}
