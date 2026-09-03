'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type Ref,
} from 'react';
import { OsAutolinkChip } from '@/features/home/os-autolink-chip';
import { splitPostRichText } from '@/features/home/post-rich-segments';
import {
  isProfileBioRangeBold,
  splitProfileBioBoldEditorRuns,
  toggleProfileBioBold,
} from '@/lib/profile-bio-bold';

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else ref.current = node;
    }
  };
}

function BioBackdropText({ value }: { value: string }) {
  return (
    <>
      {splitProfileBioBoldEditorRuns(value).map((run, index) => {
        if (run.kind === 'mark') {
          return (
            <span key={`k-${index}`} className="account-editor-bio-mark">
              {run.value}
            </span>
          );
        }
        if (run.kind === 'bold') {
          return (
            <strong key={`b-${index}`} className="account-editor-bio-bold-run">
              {run.value}
            </strong>
          );
        }
        return <span key={`p-${index}`}>{run.value}</span>;
      })}
    </>
  );
}

/**
 * Profile bio field with live # / $ / @ / url color via a mirrored backdrop
 * (same idea as the post composer, without mention suggestions).
 * B on the field chrome stores `**bold**`.
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
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const segments = splitPostRichText(value);
  const boldActive = isProfileBioRangeBold(
    value,
    selection.start,
    selection.end
  );

  const syncSelection = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    setSelection({ start: el.selectionStart, end: el.selectionEnd });
  };

  useLayoutEffect(() => {
    const el = localRef.current;
    const backdrop = backdropRef.current;
    if (!el || !backdrop) return;
    backdrop.scrollTop = el.scrollTop;
  }, [value]);

  const applyBold = () => {
    const el = localRef.current;
    const start = el?.selectionStart ?? selection.start;
    const end = el?.selectionEnd ?? selection.end;
    const next = toggleProfileBioBold(value, start, end, maxLength);
    onChange(next.text);
    requestAnimationFrame(() => {
      const field = localRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(next.start, next.end);
      setSelection({ start: next.start, end: next.end });
    });
  };

  return (
    <div className="account-editor-bio-shell">
      <div className="account-editor-bio-chrome">
        <button
          type="button"
          className={`account-editor-bio-bold${boldActive ? ' is-active' : ''}`}
          aria-label="Bold"
          aria-pressed={boldActive}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={applyBold}
        >
          B
        </button>
      </div>
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
            return <BioBackdropText key={`t-${index}`} value={segment.value} />;
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
          onBlur={(event) => {
            syncSelection(event.currentTarget);
            onBlur?.(event);
          }}
          onSelect={(event) => {
            syncSelection(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key.toLowerCase() === 'b'
            ) {
              event.preventDefault();
              applyBold();
            }
          }}
          onKeyUp={(event) => {
            syncSelection(event.currentTarget);
          }}
          onClick={(event) => {
            syncSelection(event.currentTarget);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            syncSelection(event.currentTarget);
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
