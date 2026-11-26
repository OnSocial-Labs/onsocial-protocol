'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';

/**
 * Reserved seat for late copy. Caller owns size via `className`.
 *
 * Frame-1 content paints opaque. Soft-fill into a reserved seat stays
 * opaque (`fade={false}`, default for wallet/mint seats). Pass `fade` only
 * when a true late line had no prior geometry and must appear once.
 */
export function OsLateFill({
  className,
  children,
  fade = false,
}: {
  className?: string;
  children?: ReactNode;
  /** When true, empty→content gets one `--os-motion-appear` fade. */
  fade?: boolean;
}) {
  const empty = children == null || children === false;
  const [startedEmpty] = useState(() => empty);
  const [ready, setReady] = useState(() => !empty);

  useLayoutEffect(() => {
    if (!fade || empty || ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot appear after late fill mounts
    setReady(true);
  }, [empty, fade, ready]);

  const mode = empty
    ? 'empty'
    : !fade || !startedEmpty
      ? 'seeded'
      : ready
        ? 'ready'
        : 'pending';

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
