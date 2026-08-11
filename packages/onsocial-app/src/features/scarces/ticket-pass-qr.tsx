'use client';

import { useMemo } from 'react';
import { renderSVG } from 'uqr';

/** High-contrast QR for Show pass — black modules on white card. */
export function TicketPassQr({
  value,
  title = 'Pass QR code',
  className,
}: {
  value: string;
  title?: string;
  className?: string;
}) {
  const markup = useMemo(() => {
    const payload = value.trim();
    if (!payload) return null;
    try {
      return renderSVG(payload, {
        ecc: 'M',
        border: 2,
        whiteColor: '#ffffff',
        blackColor: '#111111',
      });
    } catch {
      return null;
    }
  }, [value]);

  if (!markup) {
    return (
      <div className={className} role="img" aria-label={title}>
        <p className="ticket-pass-qr-fallback">Could not draw pass code.</p>
      </div>
    );
  }

  return (
    <div
      className={className}
      role="img"
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
