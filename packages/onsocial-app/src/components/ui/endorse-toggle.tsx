'use client';

import { ProtocolMotionArrow, PulsingDots } from '@onsocial/ui';

interface EndorseToggleProps {
  active: boolean;
  pending?: boolean;
}

function EndorseToggleSizingGhost() {
  return (
    <>
      <ProtocolMotionArrow className="standing-toggle-arrow" />
      Endorsed
    </>
  );
}

/** Face endorse morph — Stand-style pending dots / Endorsed / Edit. */
export function EndorseToggle({ active, pending = false }: EndorseToggleProps) {
  if (pending) {
    return (
      <span className="standing-toggle">
        <span
          className="standing-toggle-state standing-toggle-state--ghost"
          aria-hidden
        >
          <EndorseToggleSizingGhost />
        </span>
        <span className="standing-toggle-state standing-toggle--pending">
          <PulsingDots size="sm" className="standing-toggle-pending-dots" />
        </span>
      </span>
    );
  }

  return (
    <span className="standing-toggle">
      <span
        className="standing-toggle-state standing-toggle-state--ghost"
        aria-hidden
      >
        <EndorseToggleSizingGhost />
      </span>
      {!active ? (
        <span className="standing-toggle-state">
          <span className="signal-group signal-group-endorse" aria-hidden>
            <ProtocolMotionArrow className="signal-metric-arrow" />
          </span>
          Endorse
        </span>
      ) : (
        <>
          <span className="standing-toggle-state standing-toggle-state--idle group-hover:opacity-0 group-focus-visible:opacity-0">
            <span className="standing-toggle-icon-slot" aria-hidden>
              <span className="standing-toggle-dot endorse-toggle-dot" />
            </span>
            Endorsed
          </span>
          <span className="standing-toggle-state standing-toggle-state--hover group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="signal-group signal-group-endorse" aria-hidden>
              <ProtocolMotionArrow className="signal-metric-arrow" />
            </span>
            Edit
          </span>
        </>
      )}
    </span>
  );
}
