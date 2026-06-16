'use client';

import { useEffect, useState } from 'react';
import {
  formatCountdownToTimestampNs,
  resolveCountdownTickMs,
} from '@/lib/relative-duration';

export function SeasonCountdownLabel({
  targetNs,
  prefix,
  suffix,
  compact = false,
  className,
}: {
  targetNs: number;
  prefix?: string;
  suffix?: string;
  /** Shorter labels for metric rails (6h 34m, no "left"). */
  compact?: boolean;
  className?: string;
}) {
  const [label, setLabel] = useState(() =>
    formatCountdownToTimestampNs(targetNs, Date.now(), { compact })
  );

  useEffect(() => {
    const tick = () => {
      setLabel(formatCountdownToTimestampNs(targetNs, Date.now(), { compact }));
    };

    tick();
    const intervalMs = resolveCountdownTickMs(targetNs, Date.now(), compact);
    const intervalId = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [compact, targetNs]);

  if (targetNs <= 0) {
    return null;
  }

  return (
    <span className={className}>
      {prefix ? `${prefix} ` : null}
      {label}
      {suffix ? ` ${suffix}` : null}
    </span>
  );
}
