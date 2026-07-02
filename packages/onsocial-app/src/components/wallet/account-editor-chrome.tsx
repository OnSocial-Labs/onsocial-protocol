'use client';

import { SheetCloseButton } from '@onsocial/ui';

/** Banner overlay chrome — close only; title is sr-only for sheet labelling. */
export function AccountEditorChrome({
  titleId,
  title,
  onClose,
  className,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className={`account-editor-sheet-header${className ? ` ${className}` : ''}`}
    >
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      <div className="account-editor-chrome-row">
        <SheetCloseButton onClick={onClose} ariaLabel="Close editor" />
      </div>
    </div>
  );
}
