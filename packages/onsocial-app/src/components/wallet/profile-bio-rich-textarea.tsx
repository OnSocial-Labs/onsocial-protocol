'use client';

import {
  useLayoutEffect,
  useRef,
  type FocusEventHandler,
  type Ref,
} from 'react';
import { OsAutolinkChip } from '@/features/home/os-autolink-chip';
import { splitPostRichText } from '@/features/home/post-rich-segments';

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else ref.current = node;
    }
  };
}

/**
 * Profile bio field with live # / $ / @ / url color via a mirrored backdrop
 * (same idea as the post composer, without mention suggestions).
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
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  id?: string;
  placeholder?: string;
  maxLength?: number;
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const segments = splitPostRichText(value);

  useLayoutEffect(() => {
    const el = localRef.current;
    const backdrop = backdropRef.current;
    if (!el || !backdrop) return;
    backdrop.scrollTop = el.scrollTop;
  }, [value]);

  return (
    <div className="account-editor-bio-shell">
      <div className="account-editor-bio-field">
        <div
          ref={backdropRef}
          className="account-editor-bio-backdrop"
          aria-hidden
        >
          {segments.map((segment, index) => {
            if (segment.type === 'hashtag') {
              return (
                <span key={`h-${index}`} className="os-hashtag">
                  {segment.value}
                </span>
              );
            }
            if (segment.type === 'ticker') {
              return (
                <span key={`k-${index}`} className="os-ticker">
                  {segment.value}
                </span>
              );
            }
            if (segment.type === 'mention') {
              return (
                <span key={`m-${index}`} className="os-mention">
                  {segment.value}
                </span>
              );
            }
            if (segment.type === 'url') {
              return (
                <OsAutolinkChip
                  key={`u-${index}`}
                  href={segment.href}
                  text={segment.value}
                  variant="mirror"
                />
              );
            }
            return <span key={`t-${index}`}>{segment.value}</span>;
          })}
          {value.endsWith('\n') ? '\n' : null}
        </div>
        <textarea
          ref={mergeRefs(localRef, textareaRef)}
          id={id}
          className="account-editor-bio is-rich-overlay"
          value={value}
          maxLength={maxLength}
          rows={1}
          placeholder={placeholder}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onScroll={(event) => {
            if (backdropRef.current) {
              backdropRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
        />
      </div>
    </div>
  );
}
