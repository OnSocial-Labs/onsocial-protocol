'use client';

import { Children, Fragment, type ReactNode } from 'react';
import { Divider } from '@onsocial/ui';
import {
  DropFieldLabel,
  type DropFieldInfoKey,
} from '@/features/scarces/drop-field-info';

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
  infoKey,
  onOpenInfo,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onClick: () => void;
  infoKey?: DropFieldInfoKey;
  onOpenInfo?: (key: DropFieldInfoKey) => void;
}) {
  const showInfo = Boolean(infoKey && onOpenInfo);
  const action = (
    <button
      type="button"
      className={
        showInfo ? 'drop-create-extra-row-action' : 'drop-create-extra-row'
      }
      disabled={disabled}
      aria-label={`${label}: ${value}`}
      onClick={onClick}
    >
      {showInfo ? null : (
        <span className="drop-create-extra-row-label">{label}</span>
      )}
      <span className="drop-create-extra-row-value">{value}</span>
    </button>
  );

  if (!showInfo || !infoKey || !onOpenInfo) return action;

  return (
    <div className="drop-create-extra-row drop-create-extra-row--with-info">
      <DropFieldLabel label={label} infoKey={infoKey} onOpenInfo={onOpenInfo} />
      {action}
    </div>
  );
}
