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
  Divider,
  ImageIcon,
  OsIconAction,
  osFieldSoftClassName,
} from '@onsocial/ui';
import { useWriteDockChrome } from '@/contexts/compose-launcher-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import {
  WRITE_DOCK_MEDIA_ACCEPT,
  writeDockCanSend,
  writeDockShouldSendOnEnter,
} from '@/lib/os-write-dock';

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

export interface OsWriteDockProps {
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  pending?: boolean;
  error?: string | null;
  above?: ReactNode;
  accept?: string;
  onSubmit: (payload: {
    text: string;
    files: File[];
  }) => boolean | void | Promise<boolean | void>;
}

export function OsWriteDock({
  placeholder,
  ariaLabel = 'Compose',
  disabled = false,
  pending = false,
  error = null,
  above,
  accept = WRITE_DOCK_MEDIA_ACCEPT,
  onSubmit,
}: OsWriteDockProps) {
  const fieldId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll<HTMLTextAreaElement>();
  const { registerWriteFocus, setWritePinned } = useWriteDockChrome();
  const { isConnected, connect } = useAppWallet();
  const [text, setText] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [expanded, setExpanded] = useState(false);
  const submitLockRef = useRef(false);
  const mediaPreviewUrl = mediaPreviewUrlFor(mediaFile);
  const canSend = writeDockCanSend(
    text,
    mediaFile ? 1 : 0,
    disabled || pending
  );

  useEffect(() => {
    if (!registerWriteFocus) return;
    return registerWriteFocus(() => {
      textRef.current?.focus();
    });
  }, [registerWriteFocus]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, expanded ? 96 : 40)}px`;
  }, [expanded, text]);

  const clearMedia = () => {
    revokeMediaPreview(mediaFile);
    setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!isConnected) {
      await connect();
      return;
    }
    if (!canSend || submitLockRef.current) return;
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
        clearMedia();
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
                onClick={clearMedia}
              >
                Remove
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
          onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
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
          onChange={(event) => setText(event.target.value)}
          onFocus={(event) => {
            setExpanded(true);
            setWritePinned?.(true);
            scrollFieldIntoView(event);
          }}
          onBlur={() => {
            setExpanded(false);
            setWritePinned?.(false);
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
        <OsIconAction
          ariaLabel="Attach photo or video"
          disabled={disabled || pending}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="os-write-dock-media-icon" aria-hidden />
        </OsIconAction>
        <button
          type="submit"
          className="os-write-dock-send"
          disabled={disabled || pending || (isConnected && !canSend)}
          aria-label={!isConnected ? 'Connect to send' : 'Send'}
        >
          <WriteDockSendIcon />
        </button>
      </div>
    </form>
  );
}
