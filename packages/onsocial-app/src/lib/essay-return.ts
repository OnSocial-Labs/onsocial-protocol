import { accountIdsEqual } from '@/lib/account-match';

const ESSAY_REOPEN_KEY = 'onsocialEssayReopen';
const ESSAY_REOPEN_TTL_MS = 2 * 60 * 1000;

type EssayReopen = {
  accountId: string;
  postId: string;
  at: number;
};

/** Feed article is not a URL — remember it so dock leave can reopen the same overlay. */
export function rememberEssayReopen(entry: {
  accountId: string;
  postId: string;
}): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const payload: EssayReopen = {
      accountId: entry.accountId.trim(),
      postId: entry.postId.trim(),
      at: Date.now(),
    };
    if (!payload.accountId || !payload.postId) return;
    sessionStorage.setItem(ESSAY_REOPEN_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

/** True once, only for this article. */
export function consumeEssayReopen(accountId: string, postId: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(ESSAY_REOPEN_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<EssayReopen>;
    if (
      typeof parsed.accountId !== 'string' ||
      typeof parsed.postId !== 'string' ||
      typeof parsed.at !== 'number' ||
      Date.now() - parsed.at > ESSAY_REOPEN_TTL_MS
    ) {
      sessionStorage.removeItem(ESSAY_REOPEN_KEY);
      return false;
    }
    const match =
      accountIdsEqual(parsed.accountId, accountId) &&
      parsed.postId.trim() === postId.trim();
    if (match) sessionStorage.removeItem(ESSAY_REOPEN_KEY);
    return match;
  } catch {
    return false;
  }
}
