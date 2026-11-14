'use client';

import {
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { IpfsImg } from '@onsocial/ui';
import {
  MEDIA_FRAME_PAN_CENTER,
  mediaFramePanStyle,
  panMediaFrameByDelta,
  type MediaFramePan,
} from '@/lib/media-frame-pan';

const TAP_SLOP_PX = 6;

type MediaFramePanSurfaceProps = {
  src: string;
  pan: MediaFramePan;
  onPanChange: (pan: MediaFramePan) => void;
  /** Fired on pointer-up when the gesture did not pan (replace / activate). */
  onTap?: () => void;
  disabled?: boolean;
  className?: string;
  imgClassName?: string;
  alt?: string;
  sizes?: string;
  srcSet?: string;
  children?: ReactNode;
};

/**
 * Cover-frame pan — drag repositions; a quiet tap still reaches `onTap`
 * (replace). Dismiss / reorder chrome must sit outside this surface.
 */
export function MediaFramePanSurface({
  src,
  pan,
  onPanChange,
  onTap,
  disabled = false,
  className,
  imgClassName,
  alt = '',
  sizes,
  srcSet,
  children,
}: MediaFramePanSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    pan: MediaFramePan;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        'button, a, input, textarea, [data-media-pan-ignore]'
      )
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      pan,
      moved: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dxTotal = event.clientX - gesture.startX;
    const dyTotal = event.clientY - gesture.startY;
    if (
      !gesture.moved &&
      dxTotal * dxTotal + dyTotal * dyTotal < TAP_SLOP_PX * TAP_SLOP_PX
    ) {
      return;
    }
    gesture.moved = true;
    if (!dragging) setDragging(true);

    const frame = rootRef.current?.getBoundingClientRect();
    const img = imgRef.current;
    if (!frame || !img) return;
    const imageW = img.naturalWidth || img.width;
    const imageH = img.naturalHeight || img.height;
    const dx = event.clientX - gesture.lastX;
    const dy = event.clientY - gesture.lastY;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const next = panMediaFrameByDelta(
      gesture.pan,
      dx,
      dy,
      frame.width,
      frame.height,
      imageW,
      imageH
    );
    gesture.pan = next;
    onPanChange(next);
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    if (!gesture.moved) onTap?.();
  };

  return (
    <div
      ref={rootRef}
      className={[
        'media-frame-pan-surface',
        dragging ? 'is-dragging' : '',
        disabled ? 'is-disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      style={{ touchAction: disabled ? undefined : 'none' }}
    >
      <IpfsImg
        ref={imgRef}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        className={imgClassName}
        draggable={false}
        style={mediaFramePanStyle(pan ?? MEDIA_FRAME_PAN_CENTER)}
      />
      {children}
    </div>
  );
}
