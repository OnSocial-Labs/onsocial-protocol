/** Movement before a swipe is distinguished from a scroll. */
export const DM_REPLY_SWIPE_SLOP_PX = 10;
/** Release past this distance replies. Matches a comfortable thumb drag. */
export const DM_REPLY_SWIPE_COMMIT_PX = 48;
/** Cap so the bubble never leaves the row. */
export const DM_REPLY_SWIPE_MAX_PX = 72;

export type DmReplySwipeAxis = 'x' | 'y' | null;

export type DmReplySwipeFrame = {
  axis: DmReplySwipeAxis;
  /** Rightward translation. Vertical scrolls stay at 0. */
  offset: number;
  commit: boolean;
};

/**
 * Swipe-right to reply. A vertical-dominant start is a scroll and never
 * commits. Once the axis locks horizontal, later drift stays a swipe.
 */
export function dmReplySwipeFrame(
  sample: { dx: number; dy: number; axis: DmReplySwipeAxis },
  phase: 'move' | 'end'
): DmReplySwipeFrame {
  const { dx, dy } = sample;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { axis: sample.axis, offset: 0, commit: false };
  }
  let axis = sample.axis;
  if (axis == null) {
    if (
      Math.abs(dx) < DM_REPLY_SWIPE_SLOP_PX &&
      Math.abs(dy) < DM_REPLY_SWIPE_SLOP_PX
    ) {
      return { axis: null, offset: 0, commit: false };
    }
    axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  if (axis === 'y') return { axis, offset: 0, commit: false };
  const offset = Math.max(0, Math.min(DM_REPLY_SWIPE_MAX_PX, dx));
  return {
    axis,
    offset,
    commit: phase === 'end' && offset >= DM_REPLY_SWIPE_COMMIT_PX,
  };
}

const SWIPE_BLOCK =
  'button, a, input, textarea, select, video, audio, [data-dm-no-swipe]';

/** Links, the quote control, and media chrome keep their own gestures. */
export function dmReplySwipeBlockedTarget(target: EventTarget | null): boolean {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    Boolean(target.closest(SWIPE_BLOCK))
  );
}

/** Accessible name for the reply control — the message, not a bare "Reply". */
export function dmReplyActionLabel(preview: string): string {
  const body = preview.trim() || 'this message';
  return `Reply to “${body}”`;
}

/** Accessible name for jumping from a quote to its parent. */
export function dmQuoteJumpLabel(opts: {
  mine: boolean;
  peerName: string;
  preview: string;
}): string {
  const owner = opts.mine ? 'your' : `${opts.peerName.trim() || 'their'}’s`;
  return `Show ${owner} message, ${opts.preview}`;
}
