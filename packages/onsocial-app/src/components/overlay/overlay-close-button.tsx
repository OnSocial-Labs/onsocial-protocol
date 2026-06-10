'use client';

interface OverlayCloseButtonProps {
  onClick: () => void;
  ariaLabel: string;
}

export function OverlayCloseButton({
  onClick,
  ariaLabel,
}: OverlayCloseButtonProps) {
  return (
    <button
      type="button"
      className="overlay-close"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  );
}
