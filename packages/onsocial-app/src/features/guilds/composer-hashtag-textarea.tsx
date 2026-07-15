'use client';

import {
  useLayoutEffect,
  useRef,
  type FocusEventHandler,
  type Ref,
} from 'react';
import { splitTextWithHashtags } from '@/features/home/home-hashtag-search';

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else ref.current = node;
    }
  };
}

export function ComposerHashtagTextarea({
  value,
  onChange,
  onFocus,
  placeholder,
  ariaLabel,
  maxLength,
  disabled,
  rows = 2,
  textareaRef,
  className = 'guild-composer-input',
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  placeholder: string;
  ariaLabel: string;
  maxLength?: number;
  disabled?: boolean;
  rows?: number;
  textareaRef?: Ref<HTMLTextAreaElement>;
  className?: string;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const segments = splitTextWithHashtags(value);

  useLayoutEffect(() => {
    const el = localRef.current;
    const backdrop = backdropRef.current;
    if (!el || !backdrop) return;
    backdrop.scrollTop = el.scrollTop;
  }, [value]);

  return (
    <div className="guild-composer-input-shell">
      <div
        ref={backdropRef}
        className="guild-composer-input-backdrop"
        aria-hidden
      >
        {segments.map((segment, index) =>
          segment.type === 'hashtag' ? (
            <span key={`h-${index}`} className="os-hashtag">
              {segment.value}
            </span>
          ) : (
            <span key={`t-${index}`}>{segment.value}</span>
          )
        )}
        {/* Keep trailing newline height in sync with textarea. */}
        {value.endsWith('\n') ? '\n' : null}
      </div>
      <textarea
        ref={mergeRefs(localRef, textareaRef)}
        className={`${className} is-hashtag-overlay`}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onScroll={(event) => {
          if (backdropRef.current) {
            backdropRef.current.scrollTop = event.currentTarget.scrollTop;
          }
        }}
      />
    </div>
  );
}
