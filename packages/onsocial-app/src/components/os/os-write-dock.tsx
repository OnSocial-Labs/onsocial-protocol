'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Divider, ImageIcon, osFieldSoftClassName } from '@onsocial/ui';
import {
  useWriteDockChrome,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import {
  WRITE_DOCK_MEDIA_ACCEPT,
  writeDockCanSend,
  writeDockShouldSendOnEnter,
  writeDockShowExpand,
  writeDockShowSend,
} from '@/lib/os-write-dock';
import {
  clearWriteDockDraft,
  readWriteDockDraft,
  writeDockDraftIsDirty,
  writeWriteDockDraft,
} from '@/lib/os-write-dock-draft';

const mediaPreviewUrls = new WeakMap<File, string>();

function mediaPreviewUrlFor(file: File | null): string | null {
  if (!file) return null;
  const cached = mediaPreviewUrls.get(file);
  if (cached) return cached;
  const url = URL.createObjectURL(file);
  mediaPreviewUrls.set(file, url);
  return url;
}

function revokeMediaPreview(file: File | null) {
  if (!file) return;
  const url = mediaPreviewUrls.get(file);
  if (!url) return;
  URL.revokeObjectURL(url);
  mediaPreviewUrls.delete(file);
}

function WriteDockSendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="os-write-dock-send-icon" aria-hidden>
      <path
        fill="currentColor"
        d="M12 5.2 6.1 11.1a1 1 0 0 0 1.4 1.4L11 8.9V18a1 1 0 1 0 2 0V8.9l3.5 3.6a1 1 0 0 0 1.4-1.4Z"
      />
    </svg>
  );
}

/** Compose expand — box + out arrow. Not the Listen scale-up mark. */
function WriteDockExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="os-write-dock-expand-icon" aria-hidden>
      <rect
        x="4.5"
        y="9"
        width="10.5"
        height="10.5"
        rx="2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 5.2h5.8V11M19 5.2 11.2 13"
      />
    </svg>
  );
}

export function OsWriteDockReplyChip({
  label,
  onCancel,
}: {
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="os-write-dock-reply">
      <p className="os-write-dock-reply-copy">
        <span className="os-write-dock-reply-kicker">Replying</span>
        <span className="os-write-dock-reply-name">{label}</span>
      </p>
      <button
        type="button"
        className="os-write-dock-reply-cancel"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

export interface OsWriteDockProps {
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  pending?: boolean;
  error?: string | null;
  above?: ReactNode;
  accept?: string;
  draftKey?: string;
  onExpand?: (payload: WriteDockSubmit) => void;
  onSubmit: (payload: WriteDockSubmit) => boolean | void | Promise<boolean | void>;
}

export function OsWriteDock({
  placeholder,
  ariaLabel = 'Compose',
  disabled = false,
  pending = false,
  error = null,
  above,
  accept = WRITE_DOCK_MEDIA_ACCEPT,
  draftKey,
  onExpand,
  onSubmit,
}: OsWriteDockProps) {
  const fieldId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll<HTMLTextAreaElement>();
  const { registerWriteFocus, setWritePinned } = useWriteDockChrome();
  const { isConnected, connect } = useAppWallet();
  const initialDraft = draftKey
    ? readWriteDockDraft(draftKey)
    : { text: '', file: null };
  const [text, setText] = useState(initialDraft.text);
  const [mediaFile, setMediaFile] = useState<File | null>(initialDraft.file);
  const [expanded, setExpanded] = useState(() =>
    writeDockDraftIsDirty(initialDraft)
  );
  const submitLockRef = useRef(false);
  const mediaPreviewUrl = mediaPreviewUrlFor(mediaFile);
  const canSend = writeDockCanSend(
    text,
    mediaFile ? 1 : 0,
    disabled || pending
  );
  const showSend = writeDockShowSend(canSend, pending);
  const showExpand = writeDockShowExpand(Boolean(onExpand), expanded);

  const persistDraft = (nextText: string, nextFile: File | null) => {
    if (!draftKey) return;
    writeWriteDockDraft(draftKey, { text: nextText, file: nextFile });
  };

  const currentPayload = (): WriteDockSubmit => ({
    text,
    files: mediaFile ? [mediaFile] : [],
  });

  const holdOpen = () => {
    setExpanded(true);
    setWritePinned?.(true);
  };

  useEffect(() => {
    if (!registerWriteFocus) return;
    return registerWriteFocus(() => {
      setExpanded(true);
      setWritePinned?.(true);
      textRef.current?.focus();
    });
  }, [registerWriteFocus, setWritePinned]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, expanded ? 96 : 40)}px`;
  }, [expanded, text]);

  const clearMedia = () => {
    revokeMediaPreview(mediaFile);
    setMediaFile(null);
    persistDraft(text, null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend || submitLockRef.current) return;
    if (!isConnected) {
      await connect();
      return;
    }
    submitLockRef.current = true;
    const outgoingText = text;
    const outgoingMedia = mediaFile;
    try {
      const result = await onSubmit({
        text: outgoingText,
        files: outgoingMedia ? [outgoingMedia] : [],
      });
      if (result !== false) {
        setText('');
        revokeMediaPreview(outgoingMedia);
        setMediaFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (draftKey) clearWriteDockDraft(draftKey);
        setExpanded(false);
        setWritePinned?.(false);
      }
    } finally {
      submitLockRef.current = false;
    }
  };

  return (
    <form
      className={`os-write-dock${expanded ? ' is-expanded' : ''}`}
      onSubmit={(event) => void handleSubmit(event)}
      aria-label={ariaLabel}
    >
      {above || (mediaPreviewUrl && mediaFile) || error ? (
        <div className="os-write-dock-above">
          {above}
          {mediaPreviewUrl && mediaFile ? (
            <div className="os-write-dock-preview">
              {mediaFile.type.startsWith('video/') ? (
                <video
                  src={mediaPreviewUrl}
                  className="os-write-dock-preview-el"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={mediaPreviewUrl}
                  alt=""
                  className="os-write-dock-preview-el"
                />
              )}
              <button
                type="button"
                className="os-write-dock-preview-remove"
                disabled={disabled || pending}
                aria-label="Remove"
                onClick={clearMedia}
              >
                ×
              </button>
            </div>
          ) : null}
          {error ? (
            <p className="os-write-dock-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="os-write-dock-bar">
        <input
          ref={fileInputRef}
          id={`${fieldId}-media`}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={disabled || pending}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            revokeMediaPreview(mediaFile);
            setMediaFile(next);
            persistDraft(text, next);
            if (next) holdOpen();
          }}
        />
        <textarea
          ref={textRef}
          id={`${fieldId}-text`}
          className={`${osFieldSoftClassName} os-write-dock-input`}
          value={text}
          disabled={disabled || pending}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          rows={1}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            persistDraft(next, mediaFile);
            holdOpen();
          }}
          onFocus={(event) => {
            holdOpen();
            scrollFieldIntoView(event);
          }}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              !writeDockShouldSendOnEnter()
            ) {
              return;
            }
            event.preventDefault();
            void handleSubmit();
          }}
        />
        <Divider
          orientation="vertical"
          variant="detail"
          className="portfolio-summon-divider os-write-dock-divider"
        />
        <button
          type="button"
          className="os-write-dock-tool"
          aria-label="Attach photo or video"
          disabled={disabled || pending}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="os-write-dock-media-icon" aria-hidden />
        </button>
        {showExpand ? (
          <button
            type="button"
            className="os-write-dock-tool is-quiet"
            aria-label="Open full composer"
            disabled={disabled || pending}
            onClick={() => {
              persistDraft(text, mediaFile);
              holdOpen();
              onExpand?.(currentPayload());
            }}
          >
            <WriteDockExpandIcon />
          </button>
        ) : null}
        {showSend ? (
          <button
            type="submit"
            className={`os-write-dock-send${pending ? ' is-pending' : ''}`}
            disabled={disabled || pending}
            aria-label={
              pending
                ? 'Sending'
                : !isConnected
                  ? 'Connect to send'
                  : 'Send'
            }
          >
            {pending ? (
              <span className="os-write-dock-send-spinner" aria-hidden />
            ) : (
              <WriteDockSendIcon />
            )}
          </button>
        ) : null}
      </div>
    </form>
  );
}
