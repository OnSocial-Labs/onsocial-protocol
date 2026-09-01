'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  DirectionUpFillIcon,
  Divider,
  ImageIcon,
  MultiplyIcon,
  ScaleUpIcon,
} from '@onsocial/ui';
import {
  useWriteDockChrome,
  type WriteDockMorph,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import {
  WRITE_DOCK_MEDIA_ACCEPT,
  writeDockCanSend,
  writeDockInputHeightPx,
  writeDockInputLineHeightPx,
  writeDockInputMaxLines,
  writeDockShowCompactBarTools,
  writeDockShowExpand,
  writeDockShowMedia,
  writeDockShowSend,
  writeDockShowTextCount,
  writeDockTextRemaining,
  writeDockShouldSendOnEnter,
} from '@/lib/os-write-dock';
import {
  POST_MEDIA_MAX_FILES,
  appendPostMediaFiles,
  postMediaLocalPreviewUrl,
  postMediaRevokeLocalPreviewUrl,
} from '@/lib/post-media';
import { POST_TEXT_MAX_LENGTH, POST_TEXT_WARN_REMAINING } from '@/lib/post-display';
import {
  clearWriteDockDraft,
  emptyWriteDockDraft,
  readWriteDockDraft,
  writeWriteDockDraft,
} from '@/lib/os-write-dock-draft';

export function OsWriteDockReplyChip({
  label,
  onCancel,
}: {
  label: string;
  onCancel: () => void;
}) {
  const dismiss = () => onCancel();

  return (
    <div className="os-write-dock-reply">
      <p className="os-write-dock-reply-copy">
        <span className="os-write-dock-reply-kicker">Replying</span>
        <span className="os-write-dock-reply-name">{label}</span>
      </p>
      <button
        type="button"
        className="os-write-dock-reply-cancel"
        aria-label="Cancel reply"
        onPointerDown={(event) => {
          // One tap on mobile — keep focus on the field until we dismiss so
          // the keyboard does not eat the first tap before click fires.
          event.preventDefault();
          dismiss();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          dismiss();
        }}
      >
        <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
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
  const { registerWriteFocus, setWritePinned, setWriteDockMorph, setWriteDockHasDraft } =
    useWriteDockChrome();
  const { isConnected, connect } = useAppWallet();
  const initialDraft = draftKey
    ? readWriteDockDraft(draftKey)
    : emptyWriteDockDraft();
  const [text, setText] = useState(() =>
    initialDraft.text.slice(0, POST_TEXT_MAX_LENGTH)
  );
  const [mediaFiles, setMediaFiles] = useState<File[]>(() => [...initialDraft.files]);
  const mediaFilesRef = useRef(mediaFiles);
  mediaFilesRef.current = mediaFiles;
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [composeExpanded, setComposeExpanded] = useState(
    Boolean(initialDraft.text.trim() || initialDraft.files.length)
  );
  const submitLockRef = useRef(false);
  const viewport = useVisualViewportSheetMetrics(fieldFocused);
  const hasContent = Boolean(text.trim() || mediaFiles.length);
  const hasReplyChrome = Boolean(above);
  const hasErrorChrome = Boolean(error);
  const keyboardOpen =
    fieldFocused && viewport.isMobile && viewport.lift > 0;
  const footerOpen =
    composeExpanded || hasContent || hasErrorChrome || pending;
  const toolsOpen =
    footerOpen || hasReplyChrome || keyboardOpen;
  const [isTall, setIsTall] = useState(hasErrorChrome || keyboardOpen);
  const nextMorph: WriteDockMorph = isTall
    ? 'expanded'
    : toolsOpen
      ? 'tools'
      : 'idle';
  const canSend = writeDockCanSend(
    text,
    mediaFiles.length,
    disabled || pending
  );
  const showSend = writeDockShowSend(canSend, pending);
  const showCompactBarTools = writeDockShowCompactBarTools(footerOpen);
  const showCompactMedia = showCompactBarTools;
  const showCompactExpand = showCompactBarTools && Boolean(onExpand);
  const showMedia = writeDockShowMedia(footerOpen);
  const showExpand = writeDockShowExpand(Boolean(onExpand), footerOpen);
  const textRemaining = writeDockTextRemaining(text);
  const showTextCount = writeDockShowTextCount(text);

  const persistDraft = (nextText: string, nextFiles: File[]) => {
    if (!draftKey) return;
    writeWriteDockDraft(draftKey, { text: nextText, files: nextFiles });
  };

  const currentPayload = (): WriteDockSubmit => ({
    text,
    files: mediaFiles,
  });

  const attachMediaFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || disabled || pending) return;
    const result = await appendPostMediaFiles(mediaFilesRef.current, fileList);
    setMediaError(result.error);
    const unchanged =
      result.files.length === mediaFilesRef.current.length &&
      result.files.every((file, index) => file === mediaFilesRef.current[index]);
    if (unchanged) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setMediaFiles(result.files);
    persistDraft(text, result.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    setWritePinned?.(toolsOpen || isTall || fieldFocused);
  }, [fieldFocused, isTall, setWritePinned, toolsOpen]);

  useEffect(() => {
    setWriteDockMorph?.(nextMorph);
  }, [nextMorph, setWriteDockMorph]);

  useEffect(() => {
    setWriteDockHasDraft?.(hasContent);
  }, [hasContent, setWriteDockHasDraft]);

  useEffect(() => {
    return () => {
      setWriteDockMorph?.('idle');
      setWriteDockHasDraft?.(false);
    };
  }, [setWriteDockHasDraft, setWriteDockMorph]);

  const collapseComposeSessionIfEmpty = () => {
    const draftEmpty =
      !textRef.current?.value.trim() && mediaFilesRef.current.length === 0;
    if (draftEmpty && !hasErrorChrome && !pending) {
      setComposeExpanded(false);
    }
  };

  useEffect(() => {
    if (!registerWriteFocus) return;
    return registerWriteFocus(() => {
      textRef.current?.focus();
    });
  }, [registerWriteFocus]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const tallChrome = hasErrorChrome || keyboardOpen;
    const rootFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize || '16'
    );
    const linePx = writeDockInputLineHeightPx(rootFontSize);
    const maxLines = writeDockInputMaxLines(hasReplyChrome);
    const maxPx = linePx * maxLines;
    // Measure uncapped, then apply height + max so rows actually grow
    // (CSS max-height can stay at 1 line if compose-open lags a frame).
    el.style.height = '0px';
    el.style.maxHeight = 'none';
    const scrollHeight = el.scrollHeight;
    const nextHeight = writeDockInputHeightPx(
      scrollHeight,
      maxLines,
      rootFontSize
    );
    el.style.maxHeight = `${maxPx}px`;
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = nextHeight >= maxPx ? 'auto' : 'hidden';
    // Growing lines must keep first-line + avatar fixed — never morph on wrap.
    // `is-expanded` is keyboard / error chrome only (same steadiness as reply).
    const dockExpanded = tallChrome;
    setIsTall((current) => (current === dockExpanded ? current : dockExpanded));
  }, [hasErrorChrome, hasReplyChrome, keyboardOpen, text]);

  const removeMediaAt = (index: number) => {
    setMediaFiles((current) => {
      const removed = current[index];
      if (removed) postMediaRevokeLocalPreviewUrl(removed);
      const next = current.filter((_, i) => i !== index);
      persistDraft(text, next);
      return next;
    });
    setMediaError(null);
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
    const outgoingMedia = mediaFiles;
    try {
      const result = await onSubmit({
        text: outgoingText,
        files: outgoingMedia,
      });
      if (result !== false) {
        setText('');
        for (const file of outgoingMedia) postMediaRevokeLocalPreviewUrl(file);
        setMediaFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (draftKey) clearWriteDockDraft(draftKey);
        setMediaError(null);
        setFieldFocused(false);
        setComposeExpanded(false);
      }
    } finally {
      submitLockRef.current = false;
    }
  };

  const mediaAtMax = mediaFiles.length >= POST_MEDIA_MAX_FILES;
  const chromeError = error ?? mediaError;

  const mediaButton = (
    <button
      type="button"
      className={`os-write-dock-tool${mediaFiles.length ? ' is-active' : ''}`}
      aria-label="Attach photo or video"
      disabled={disabled || pending || mediaAtMax}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => fileInputRef.current?.click()}
    >
      <ImageIcon className="os-write-dock-media-icon" aria-hidden />
    </button>
  );

  const mediaPreviews =
    mediaFiles.length > 0 ? (
      <div className="os-write-dock-preview-strip" role="list">
        {mediaFiles.map((file, index) => {
          const previewUrl = postMediaLocalPreviewUrl(file);
          return (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="os-write-dock-preview"
              role="listitem"
            >
              {file.type.startsWith('video/') ? (
                <video
                  src={previewUrl}
                  className="os-write-dock-preview-el"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt=""
                  className="os-write-dock-preview-el"
                />
              )}
              <button
                type="button"
                className="os-write-dock-preview-remove"
                disabled={disabled || pending}
                aria-label="Remove"
                onClick={() => removeMediaAt(index)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    ) : null;

  const expandButton = onExpand ? (
    <button
      type="button"
      className="os-write-dock-tool"
      aria-label="Open full composer"
      disabled={disabled || pending}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        persistDraft(text, mediaFiles);
        onExpand(currentPayload());
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
      className={`os-write-dock${toolsOpen ? ' is-tools-open' : ''}${isTall ? ' is-expanded' : ''}${footerOpen ? ' is-compose-open' : ''}${showCompactBarTools ? ' is-compact-bar-tools' : ''}`}
      onSubmit={(event) => void handleSubmit(event)}
      aria-label={ariaLabel}
    >
      {above || chromeError ? (
        <div className="os-write-dock-above">
          {above}
          {chromeError ? (
            <p className="os-write-dock-error" role="alert">
              {chromeError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Outside the bar flex — `hidden` + display:none (WebKit paints
          "No file chosen" through sr-only and inflates the dock). */}
      <input
        ref={fileInputRef}
        id={`${fieldId}-media`}
        type="file"
        accept={accept}
        className="os-write-dock-file-input"
        hidden
        tabIndex={-1}
        aria-hidden
        multiple
        disabled={disabled || pending || mediaAtMax}
        onChange={(event) => {
          void attachMediaFiles(event.target.files);
        }}
      />

      <div className="os-write-dock-bar">
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
              persistDraft(next, mediaFiles);
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
                  collapseComposeSessionIfEmpty();
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
        {showCompactBarTools ? (
          <div
            className="os-write-dock-bar-actions"
            role="group"
            aria-label="Compose shortcuts"
          >
            {showCompactMedia ? mediaButton : null}
            {showCompactMedia && showCompactExpand ? (
              <Divider
                orientation="vertical"
                variant="detail"
                className="os-write-dock-bar-actions-divider self-center"
              />
            ) : null}
            {showCompactExpand ? expandButton : null}
          </div>
        ) : null}
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
              {showMedia ? mediaButton : null}
              {showMedia && mediaPreviews ? (
                <>
                  <Divider
                    orientation="vertical"
                    variant="detail"
                    className="portfolio-summon-divider os-write-dock-divider os-write-dock-footer-tools-divider"
                  />
                  {mediaPreviews}
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
              {showExpand ? expandButton : null}
              {showExpand && expandButton && sendButton ? (
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
