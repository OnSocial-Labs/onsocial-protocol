/**
 * Soft-nav Writing replaces Next layout `children` with the next route shell.
 * The open feed reader cannot stay mounted in that live slot — park it here
 * so Soft shelf hop can keep the article under Writing.
 */

import type { PostRow } from '@onsocial/sdk';

export type ParkedShelfHopArticle = {
  post: PostRow;
  titleLabel: string;
  avatarUrl: string | null;
};

let parked: ParkedShelfHopArticle | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function parkShelfHopArticle(next: ParkedShelfHopArticle) {
  parked = {
    post: next.post,
    titleLabel: next.titleLabel.trim() || next.post.accountId,
    avatarUrl: next.avatarUrl,
  };
  emit();
}

export function clearParkedShelfHopArticle() {
  if (!parked) return;
  parked = null;
  emit();
}

export function getParkedShelfHopArticle() {
  return parked;
}

export function getParkedShelfHopArticleServerSnapshot() {
  return null;
}

export function subscribeParkedShelfHopArticle(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
