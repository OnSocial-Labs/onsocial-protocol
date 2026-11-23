'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';

/**
 * Reserved seat for late copy. Caller owns size via `className`.
 *
 * Frame-1 content paints opaque. Content that arrives after an empty first
 * paint gets one `--os-motion-appear` fade — never a page-wide appear.
 */
export function OsLateFill({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const empty = children == null || children === false;
  const [startedEmpty] = useState(() => empty);
  const [ready, setReady] = useState(() => !empty);

  useLayoutEffect(() => {
    if (empty || ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot appear after late fill mounts
    setReady(true);
  }, [empty, ready]);

  const mode = empty
    ? 'empty'
    : startedEmpty
      ? ready
        ? 'ready'
        : 'pending'
      : 'seeded';

  return (
    <div
      className={[
        'os-late-fill',
        className ?? '',
        mode === 'seeded' ? 'is-seeded' : '',
        mode === 'pending' ? 'is-pending' : '',
        mode === 'ready' ? 'is-ready' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
