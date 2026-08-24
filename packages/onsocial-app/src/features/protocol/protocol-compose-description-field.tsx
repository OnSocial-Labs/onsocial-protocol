'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { osFieldBorderedClassName } from '@onsocial/ui';
import type { ProtocolCreateKind } from '@/features/protocol/protocol-create';
import {
  protocolCreateDescriptionLabel,
  protocolCreateDescriptionPlaceholder,
  protocolCreateDescriptionReady,
} from '@/features/protocol/protocol-create-compose';
import {
  getBoundedNoteFieldCounter,
  PROPOSAL_DESCRIPTION_LIMITS,
} from '@/lib/bounded-note-field';

export function ProtocolComposeDescriptionField({
  id,
  kind,
  value,
  roleId = '',
  onValueChange,
  disabled = false,
}: {
  id: string;
  kind: ProtocolCreateKind;
  value: string;
  roleId?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const counter = useMemo(
    () => getBoundedNoteFieldCounter(value, PROPOSAL_DESCRIPTION_LIMITS),
    [value]
  );
  const ready = protocolCreateDescriptionReady(value);
  const placeholder = protocolCreateDescriptionPlaceholder(kind, { roleId });
  const showCounter = counter.length > 0;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    /* Grow with content; the sheet body scrolls (no nested field scroll). */
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = 'hidden';
  }, [value, kind, showCounter, ready]);

  return (
    <label className="guild-field protocol-compose-description">
      <span>{protocolCreateDescriptionLabel(kind)}</span>
      <span className="protocol-compose-description-shell">
        <textarea
          ref={textareaRef}
          id={id}
          rows={kind === 'signal' ? 3 : 2}
          value={value}
          maxLength={PROPOSAL_DESCRIPTION_LIMITS.max}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!ready && value.trim().length > 0 ? true : undefined}
          className={[
            osFieldBorderedClassName,
            showCounter ? 'has-counter' : '',
            counter.invalidCharacters ? 'is-invalid-chars' : '',
            !ready && value.trim().length > 0 && !counter.invalidCharacters
              ? 'is-under-min'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {showCounter ? (
          <span
            className={[
              'protocol-compose-description-counter',
              counter.className,
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden
          >
            {counter.label}
          </span>
        ) : null}
      </span>
    </label>
  );
}
