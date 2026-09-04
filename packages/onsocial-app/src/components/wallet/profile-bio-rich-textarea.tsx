'use client';

import type { FocusEventHandler, Ref } from 'react';
import {
  OsRichTextField,
  type OsRichTextTool,
} from '@onsocial/ui';

export type ProfileBioRichTool = OsRichTextTool;

/**
 * Profile bio field — contenteditable WYSIWYG backed by markdown marks.
 * Pass `tools={[]}` for face bio (no chrome; bold/italic still paste).
 * About keeps the default toolbar (bold / italic / list / heading).
 * Pass `chromePortal` to pin tools under the About sheet header.
 */
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
      chromePortal={chromePortal}
      rows={rows}
      className={className}
      disabled={disabled}
    />
  );
}
