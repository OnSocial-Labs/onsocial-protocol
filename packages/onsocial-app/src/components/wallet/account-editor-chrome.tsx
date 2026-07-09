'use client';

import type { Ref } from 'react';
import { SheetCloseButton } from '@onsocial/ui';

/** Banner overlay chrome — close only; title is sr-only for sheet labelling. */
export function AccountEditorChrome({
  titleId,
  title,
  onClose,
  className,
  closeButtonRef,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  className?: string;
  closeButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div
      className={`account-editor-sheet-header${className ? ` ${className}` : ''}`}
    >
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      <div className="account-editor-chrome-row">
        <SheetCloseButton
          ref={closeButtonRef}
          onClick={onClose}
          ariaLabel="Close"
        />
      </div>
    </div>
  );
}
