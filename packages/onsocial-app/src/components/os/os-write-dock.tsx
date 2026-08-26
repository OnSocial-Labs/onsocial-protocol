'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  DirectionUpFillIcon,
  Divider,
  ImageIcon,
  ScaleUpIcon,
} from '@onsocial/ui';
import {
  useWriteDockChrome,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import {
  WRITE_DOCK_MEDIA_ACCEPT,
  writeDockCanSend,
  writeDockShowExpand,
  writeDockShowMedia,
  writeDockShowSend,
  writeDockShowTextCount,
  writeDockTextRemaining,
  writeDockShouldSendOnEnter,
} from '@/lib/os-write-dock';
import { POST_TEXT_MAX_LENGTH, POST_TEXT_WARN_REMAINING } from '@/lib/post-display';
import {
  clearWriteDockDraft,
  readWriteDockDraft,
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
  const { registerWriteFocus, setWritePinned, setWriteDockMorph } =
    useWriteDockChrome();
  const { isConnected, connect } = useAppWallet();
  const initialDraft = draftKey
    ? readWriteDockDraft(draftKey)
    : { text: '', file: null };
  const [text, setText] = useState(() =>
    initialDraft.text.slice(0, POST_TEXT_MAX_LENGTH)
  );
  const [mediaFile, setMediaFile] = useState<File | null>(initialDraft.file);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [composeExpanded, setComposeExpanded] = useState(
    Boolean(initialDraft.text.trim() || initialDraft.file)
  );
  const submitLockRef = useRef(false);
  const mediaPreviewUrl = mediaPreviewUrlFor(mediaFile);
  const viewport = useVisualViewportSheetMetrics(fieldFocused);
  const hasContent = Boolean(text.trim() || mediaFile);
  const hasReplyChrome = Boolean(above);
  const hasErrorChrome = Boolean(error);
  const keyboardOpen =
    fieldFocused && viewport.isMobile && viewport.lift > 0;
  const footerOpen =
    composeExpanded || hasContent || hasErrorChrome || pending;
  const toolsOpen =
    footerOpen || hasReplyChrome || keyboardOpen;
  const [isTall, setIsTall] = useState(
    hasReplyChrome || hasErrorChrome || keyboardOpen
  );
  const canSend = writeDockCanSend(
    text,
    mediaFile ? 1 : 0,
    disabled || pending
  );
  const showSend = writeDockShowSend(canSend, pending);
  const showMedia = writeDockShowMedia(toolsOpen);
  const showExpand = writeDockShowExpand(Boolean(onExpand), toolsOpen);
  const textRemaining = writeDockTextRemaining(text);
  const showTextCount = writeDockShowTextCount(text);

  const persistDraft = (nextText: string, nextFile: File | null) => {
    if (!draftKey) return;
    writeWriteDockDraft(draftKey, { text: nextText, file: nextFile });
  };

  const currentPayload = (): WriteDockSubmit => ({
    text,
    files: mediaFile ? [mediaFile] : [],
  });

  useEffect(() => {
    setWritePinned?.(toolsOpen || isTall || fieldFocused);
  }, [fieldFocused, isTall, setWritePinned, toolsOpen]);

  useEffect(() => {
    setWriteDockMorph?.(isTall ? 'expanded' : toolsOpen ? 'tools' : 'idle');
  }, [isTall, setWriteDockMorph, toolsOpen]);

  useEffect(() => {
    if (!hasContent && !hasErrorChrome && !pending) {
      setComposeExpanded(false);
    }
  }, [hasContent, hasErrorChrome, pending]);

  useEffect(() => {
    if (!registerWriteFocus) return;
    return registerWriteFocus(() => {
      textRef.current?.focus();
    });
  }, [registerWriteFocus]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const tallChrome = hasReplyChrome || hasErrorChrome || keyboardOpen;
    el.style.height = '0px';
    el.style.maxHeight = 'none';
    const scrollHeight = el.scrollHeight;
    el.style.maxHeight = '';
    const wrapped = scrollHeight > 26;
    const nextTall = tallChrome || wrapped;
    setIsTall(nextTall);
    const maxHeight = nextTall ? 96 : 22;
    el.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }, [hasErrorChrome, hasReplyChrome, keyboardOpen, text]);

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
        setFieldFocused(false);
      }
    } finally {
      submitLockRef.current = false;
    }
  };

  const mediaButton = showMedia ? (
    <button
      type="button"
      className={`os-write-dock-tool${mediaFile ? ' is-active' : ''}`}
      aria-label="Attach photo or video"
      disabled={disabled || pending}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => fileInputRef.current?.click()}
    >
      <ImageIcon className="os-write-dock-media-icon" aria-hidden />
    </button>
  ) : null;

  const mediaPreview =
    mediaPreviewUrl && mediaFile ? (
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
    ) : null;

  const expandButton = showExpand ? (
    <button
      type="button"
      className="os-write-dock-tool"
      aria-label="Open full composer"
      disabled={disabled || pending}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        persistDraft(text, mediaFile);
        onExpand?.(currentPayload());
      }}
    >
      <ScaleUpIcon className="os-write-dock-expand-icon" aria-hidden />
    </button>
  ) : null;

  const sendButton = showSend ? (
    <button
      type="submit"
      className={`os-write-dock-send${pending ? ' is-pending' : ''}`}
      disabled={disabled || pending}
      onMouseDown={(event) => event.preventDefault()}
      aria-label={
        pending ? 'Sending' : !isConnected ? 'Connect to send' : 'Send'
      }
    >
      {pending ? (
        <span className="os-write-dock-send-spinner" aria-hidden />
      ) : (
        <DirectionUpFillIcon className="os-write-dock-send-icon" aria-hidden />
      )}
    </button>
  ) : null;

  return (
    <form
      className={`os-write-dock${toolsOpen ? ' is-tools-open' : ''}${isTall ? ' is-expanded' : ''}${footerOpen ? ' is-compose-open' : ''}`}
      onSubmit={(event) => void handleSubmit(event)}
      aria-label={ariaLabel}
    >
      {above || error ? (
        <div className="os-write-dock-above">
          {above}
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
          }}
        />
        <div className="os-write-dock-field">
          <textarea
            ref={textRef}
            id={`${fieldId}-text`}
            className="os-write-dock-input"
            value={text}
            disabled={disabled || pending}
            placeholder={placeholder}
            aria-label={placeholder}
            maxLength={POST_TEXT_MAX_LENGTH}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            rows={1}
            onChange={(event) => {
              const next = event.target.value.slice(0, POST_TEXT_MAX_LENGTH);
              setText(next);
              persistDraft(next, mediaFile);
            }}
            onFocus={(event) => {
              setFieldFocused(true);
              setComposeExpanded(true);
              scrollFieldIntoView(event);
            }}
            onBlur={() => {
              window.setTimeout(() => {
                if (textRef.current !== document.activeElement) {
                  setFieldFocused(false);
                }
              }, 0);
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
        </div>
      </div>
      {footerOpen ? (
        <div className="os-write-dock-footer-shell">
          <Divider
            orientation="horizontal"
            variant="detail"
            className="os-write-dock-footer-divider"
          />
          <div
            className="os-write-dock-footer"
            role="toolbar"
            aria-label="Compose"
          >
            <div
              className="os-write-dock-footer-tools"
              role="group"
              aria-label="Add to message"
            >
              {mediaButton}
              {mediaPreview ? (
                <>
                  <Divider
                    orientation="vertical"
                    variant="detail"
                    className="portfolio-summon-divider os-write-dock-divider os-write-dock-footer-tools-divider"
                  />
                  {mediaPreview}
                </>
              ) : null}
            </div>
            <div className="os-write-dock-footer-actions">
              <span
                className={[
                  'os-write-dock-char-count',
                  showTextCount ? '' : 'is-idle',
                  showTextCount &&
                  textRemaining <= POST_TEXT_WARN_REMAINING
                    ? 'is-warn'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-live="polite"
                aria-hidden={!showTextCount}
                aria-label={
                  showTextCount
                    ? `${textRemaining} characters remaining`
                    : undefined
                }
              >
                {showTextCount ? textRemaining : '\u00a0'}
              </span>
              {expandButton}
              {expandButton && sendButton ? (
                  <Divider
                    orientation="vertical"
                    variant="detail"
                    className="portfolio-summon-divider os-write-dock-divider"
                  />
                ) : null}
                {sendButton}
              </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
