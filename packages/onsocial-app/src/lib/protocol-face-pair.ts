import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import {
  isProtocolGovernanceFace,
  isProtocolTreasuryFace,
  type ProtocolFaceDaoKind,
} from '@/lib/portfolio-dao-entity';

/** The other protocol face. Community DAOs are not part of this pair. */
export function protocolFacePairSibling(accountId: string): string | null {
  if (isProtocolGovernanceFace(accountId)) return TREASURY_DAO_ACCOUNT;
  if (isProtocolTreasuryFace(accountId)) return GOVERNANCE_DAO_ACCOUNT;
  return null;
}

export function protocolFacePairIndex(kind: ProtocolFaceDaoKind): number {
  return kind === 'treasury' ? 1 : 0;
}

export function protocolFacePairKindFromPager(
  scrollLeft: number,
  pageWidth: number
): ProtocolFaceDaoKind {
  if (
    !Number.isFinite(scrollLeft) ||
    !Number.isFinite(pageWidth) ||
    pageWidth <= 0
  ) {
    return 'governance';
  }
  return Math.round(scrollLeft / pageWidth) >= 1 ? 'treasury' : 'governance';
}

/** 0–1. The pill fill tracks this, not the settled face. */
export function protocolFacePairProgress(
  scrollLeft: number,
  pageWidth: number
): number {
  if (
    !Number.isFinite(scrollLeft) ||
    !Number.isFinite(pageWidth) ||
    pageWidth <= 0
  ) {
    return 0;
  }
  return Math.min(1, Math.max(0, scrollLeft / pageWidth));
}

export function protocolFacePairThumbBox(
  progress: number,
  boxes: ReadonlyArray<{ left: number; width: number }>
): { left: number; width: number } | null {
  if (boxes.length === 0) return null;
  const last = boxes.length - 1;
  const clamped = Math.min(last, Math.max(0, progress));
  const from = boxes[Math.floor(clamped)];
  const to = boxes[Math.ceil(clamped)] ?? from;
  if (!from || !to) return null;
  const mix = clamped - Math.floor(clamped);
  return {
    left: from.left + (to.left - from.left) * mix,
    width: from.width + (to.width - from.width) * mix,
  };
}
