'use client';

import {
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { ArrowLeftIcon } from '@onsocial/ui';
import {
  DM_REPLY_SWIPE_COMMIT_PX,
  dmReplySwipeBlockedTarget,
  dmReplySwipeFrame,
  type DmReplySwipeAxis,
} from '@/features/messages/dm-reply-gesture';

type DmThreadBubbleProps = {
  rowKey: string;
  registerRow: Ref<HTMLLIElement>;
  mine: boolean;
  pending: boolean;
  failed: boolean;
  flash: boolean;
  canReply: boolean;
  replyLabel: string;
  onReply: () => void;
  children: ReactNode;
};

/**
 * One thread row. Touch swipes the bubble right to reply. A pointer shows
 * Reply only while the row is hovered or focused. The control stays in the
 * tab order on touch so a keyboard can still reach it.
 */
export function DmThreadBubble({
  rowKey,
  registerRow,
  mine,
  pending,
  failed,
  flash,
  canReply,
  replyLabel,
  onReply,
  children,
}: DmThreadBubbleProps) {
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const gesture = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    axis: null as DmReplySwipeAxis,
    dragged: false,
  });
  const suppressClick = useRef(false);

  const resetGesture = () => {
    gesture.current.pointerId = -1;
    gesture.current.axis = null;
    gesture.current.dragged = false;
    setSwiping(false);
    setOffset(0);
  };

  const onPointerDown = (event: PointerEvent<HTMLLIElement>) => {
    if (!canReply || event.pointerType === 'mouse' || !event.isPrimary) return;
    if (dmReplySwipeBlockedTarget(event.target)) return;
    const g = gesture.current;
    g.pointerId = event.pointerId;
    g.startX = event.clientX;
    g.startY = event.clientY;
    g.axis = null;
    g.dragged = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLLIElement>) => {
    const g = gesture.current;
    if (g.pointerId !== event.pointerId) return;
    const frame = dmReplySwipeFrame(
      {
        dx: event.clientX - g.startX,
        dy: event.clientY - g.startY,
        axis: g.axis,
      },
      'move'
    );
    g.axis = frame.axis;
    if (frame.axis === 'y') {
      resetGesture();
      return;
    }
    if (frame.axis !== 'x') return;
    g.dragged = true;
    const el = event.currentTarget;
    try {
      if (!el.hasPointerCapture(event.pointerId)) {
        el.setPointerCapture(event.pointerId);
      }
    } catch {
      // A synthetic pointer has nothing to capture; the element still
      // receives the rest of the gesture.
    }
    setSwiping(true);
    setOffset(frame.offset);
  };

  const finishGesture = (
    event: PointerEvent<HTMLLIElement>,
    allowCommit: boolean
  ) => {
    const g = gesture.current;
    if (g.pointerId !== event.pointerId) return;
    const frame = dmReplySwipeFrame(
      {
        dx: event.clientX - g.startX,
        dy: event.clientY - g.startY,
        axis: g.axis,
      },
      'end'
    );
    if (g.dragged) suppressClick.current = true;
    resetGesture();
    if (allowCommit && frame.commit) onReply();
  };

  const rowClass = [
    'messages-bubble-row',
    mine ? 'is-mine' : '',
    swiping ? 'is-reply-swiping' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const bubbleClass = [
    'messages-bubble',
    mine ? 'is-mine' : '',
    pending ? 'is-pending' : '',
    failed ? 'is-failed' : '',
    flash ? 'is-quote-flash' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      ref={registerRow}
      data-dm-row-key={rowKey}
      className={rowClass}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishGesture(event, true)}
      onPointerCancel={(event) => finishGesture(event, false)}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {canReply ? (
        <span
          className="messages-bubble-swipe-hint"
          aria-hidden="true"
          style={{
            opacity: Math.min(1, offset / DM_REPLY_SWIPE_COMMIT_PX),
          }}
        >
          <ArrowLeftIcon />
        </span>
      ) : null}
      <div
        className={bubbleClass}
        tabIndex={-1}
        style={
          offset > 0
            ? { transform: `translate3d(${offset}px, 0, 0)` }
            : undefined
        }
      >
        {children}
        {canReply ? (
          <button
            type="button"
            className="messages-bubble-reply"
            aria-label={replyLabel}
            onClick={onReply}
          >
            Reply
          </button>
        ) : null}
      </div>
    </li>
  );
}
