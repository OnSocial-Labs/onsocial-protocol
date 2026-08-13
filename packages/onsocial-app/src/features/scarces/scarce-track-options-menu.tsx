'use client';

import { useRef, useState } from 'react';
import { DownloadIcon, DotsVerticalIcon, SaveIcon } from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { MediaDownloadProgressRing } from '@/components/ui/media-download-control';
import type { DownloadProgressHandler } from '@/lib/media-download';

export function ScarceTrackOptionsMenu({
  label,
  index,
  cached,
  canKeepOffline,
  offlineUnknown,
  downloadLock,
  onLockChange,
  onSave,
  onDownload,
  onRemove,
}: {
  label: string;
  index: number;
  cached: boolean;
  canKeepOffline: boolean;
  offlineUnknown: boolean;
  downloadLock: string | null;
  onLockChange: (busy: boolean) => void;
  onSave: (onProgress: DownloadProgressHandler) => Promise<void>;
  onDownload: (onProgress: DownloadProgressHandler) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const lockKey = `menu-${index}`;
  const lockedOut = downloadLock != null && downloadLock !== lockKey;

  async function runJob(
    job: (onProgress: DownloadProgressHandler) => Promise<void>
  ) {
    if (inFlightRef.current || lockedOut) return;
    inFlightRef.current = true;
    setOpen(false);
    let started = false;
    const markProgress: DownloadProgressHandler = (ratio) => {
      if (!started) {
        started = true;
        setBusy(true);
        onLockChange(true);
      }
      setProgress(ratio);
    };
    try {
      await job(markProgress);
    } catch {
      // Caller toasts.
    } finally {
      inFlightRef.current = false;
      setBusy(false);
      setProgress(null);
      onLockChange(false);
    }
  }

  const items: ActionDrawerItem[] = [
    {
      id: 'save',
      label: 'Save on device',
      description: 'File copy in Downloads or a folder',
      leading: <SaveIcon className="os-action-drawer-icon" aria-hidden />,
      disabled: lockedOut || busy,
      onSelect: () => {
        void runJob(onSave);
      },
    },
  ];

  if (canKeepOffline || offlineUnknown) {
    if (cached && canKeepOffline) {
      items.push({
        id: 'remove',
        label: 'Remove from app',
        description: 'Stops offline playback for this track',
        leading: <DownloadIcon className="os-action-drawer-icon" aria-hidden />,
        trailing: (
          <span className="scarce-clip-track-menu-status">On device</span>
        ),
        destructive: true,
        disabled: lockedOut || busy,
        onSelect: () => {
          setOpen(false);
          void onRemove?.();
        },
      });
    } else {
      items.push({
        id: 'download',
        label: 'Download in app',
        description: offlineUnknown
          ? 'Checking access…'
          : 'Play offline in OnSocial',
        leading: <DownloadIcon className="os-action-drawer-icon" aria-hidden />,
        disabled: offlineUnknown || lockedOut || busy,
        onSelect: () => {
          void runJob(onDownload);
        },
      });
    }
  }

  return (
    <>
      <button
        type="button"
        className={`media-download-control scarce-clip-track-menu${
          busy ? ' is-busy' : ''
        }${cached && !busy ? ' is-cached' : ''}`}
        aria-label={
          busy
            ? `Saving ${label}`
            : cached
              ? `More for ${label}, downloaded in app`
              : `More for ${label}`
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={busy || undefined}
        disabled={lockedOut && !busy}
        onClick={() => {
          if (busy || (lockedOut && !busy)) return;
          setOpen(true);
        }}
      >
        {busy ? (
          <MediaDownloadProgressRing progress={progress} />
        ) : (
          <DotsVerticalIcon className="media-download-glyph" aria-hidden />
        )}
        {cached && !busy ? (
          <span className="scarce-clip-track-menu-pip" aria-hidden />
        ) : null}
      </button>
      <ActionDrawer
        open={open}
        onClose={() => setOpen(false)}
        label={label}
        copy={
          canKeepOffline || offlineUnknown
            ? 'Save a file copy, or keep it in the app to play offline.'
            : 'Save a file copy to your device.'
        }
        listAriaLabel={`${label} options`}
        items={items}
      />
    </>
  );
}
