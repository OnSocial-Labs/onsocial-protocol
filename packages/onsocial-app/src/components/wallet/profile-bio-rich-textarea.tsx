'use client';

import type { FocusEventHandler, Ref } from 'react';
import { OsRichTextField, type OsRichTextTool } from '@onsocial/ui';

export type ProfileBioRichTool = OsRichTextTool;

/**
 * Profile bio field — contenteditable WYSIWYG backed by markdown marks.
 * Pass `tools={[]}` for face bio (no chrome; bold/italic still paste).
 * About keeps the default toolbar (bold / italic / list / heading).
 * Pass `chromePortal` to pin tools in the sheet footer row.
 */
export function profileFormatFocusStays(
  event: { relatedTarget: EventTarget | null },
  host: HTMLElement | null
) {
  const next = event.relatedTarget;
  if (!(next instanceof Node)) return false;
  if (host?.contains(next)) return true;
  return (
    next instanceof Element &&
    Boolean(next.closest('.profile-about-edit-format-toolbar'))
  );
}
export function ProfileBioRichTextarea({
  value,
  onChange,
  onFocus,
  onBlur,
  id,
  placeholder,
  maxLength,
  textareaRef,
  tools,
  codeBlocks = false,
  ariaLabel,
  chromePortal,
  rows = 1,
  className,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  id?: string;
  placeholder?: string;
  maxLength?: number;
  /** @deprecated Prefer editor surface; kept for existing scroll-into-view refs. */
  textareaRef?: Ref<HTMLDivElement>;
  tools?: readonly ProfileBioRichTool[];
  /** Article body — fenced and pasted snippets become a code block. */
  codeBlocks?: boolean;
  ariaLabel?: string;
  chromePortal?: HTMLElement | null;
  rows?: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <OsRichTextField
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      id={id}
      placeholder={placeholder}
      maxLength={maxLength}
      editorRef={textareaRef}
      tools={tools}
      codeBlocks={codeBlocks}
      ariaLabel={ariaLabel}
      chromePortal={chromePortal}
      rows={rows}
      className={className}
      disabled={disabled}
    />
  );
}
