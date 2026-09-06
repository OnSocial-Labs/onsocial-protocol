'use client';

import { Children, Fragment, type ReactNode } from 'react';
import { Divider } from '@onsocial/ui';

export function DropCreateExtraList({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <div className="drop-create-extra-list">
      {items.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? <Divider variant="item" /> : null}
          {child}
        </Fragment>
      ))}
    </div>
  );
}

export function DropCreateExtraRow({
  label,
  value,
  disabled,
  onClick,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="drop-create-extra-row"
      disabled={disabled}
      aria-label={`${label}: ${value}`}
      onClick={onClick}
    >
      <span className="drop-create-extra-row-label">{label}</span>
      <span className="drop-create-extra-row-value">{value}</span>
    </button>
  );
}
