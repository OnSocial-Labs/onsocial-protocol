'use client';

import { ProtocolMotionArrow, PulsingDots } from '@onsocial/ui';

interface StandingToggleProps {
  active: boolean;
  pending?: boolean;
}

function StandingToggleSizingGhost() {
  return (
    <>
      <ProtocolMotionArrow className="standing-toggle-arrow" />
      Stand with
    </>
  );
}

export function StandingToggle({ active, pending = false }: StandingToggleProps) {
  if (pending) {
    return (
      <span className="standing-toggle">
        <span
          className="standing-toggle-state standing-toggle-state--ghost"
          aria-hidden
        >
          <StandingToggleSizingGhost />
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
        <StandingToggleSizingGhost />
      </span>
      {!active ? (
        <span className="standing-toggle-state">
          <ProtocolMotionArrow className="standing-toggle-arrow" />
          Stand with
        </span>
      ) : (
        <>
          <span className="standing-toggle-state standing-toggle-state--idle group-hover:opacity-0 group-focus-visible:opacity-0">
            <span className="standing-toggle-icon-slot" aria-hidden>
              <span className="standing-toggle-dot" />
            </span>
            Standing
          </span>
          <span className="standing-toggle-state standing-toggle-state--hover group-hover:opacity-100 group-focus-visible:opacity-100">
            <ProtocolMotionArrow
              direction="left"
              className="standing-toggle-arrow standing-toggle-arrow--step-back"
            />
            Step back
          </span>
        </>
      )}
    </span>
  );
}
