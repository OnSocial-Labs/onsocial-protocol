import type { ReactNode } from 'react';

interface OverlayHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function OverlayHeader({
  title,
  description,
  actions,
}: OverlayHeaderProps) {
  return (
    <header className="overlay-header">
      <div className="overlay-header-copy">
        <h2 id="overlay-title" className="overlay-title">
          {title}
        </h2>
        {description ? (
          <p className="overlay-description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="overlay-header-actions">{actions}</div> : null}
    </header>
  );
}
