import { accountIdsEqual } from '@/lib/account-match';

const WRITING_SHELF_KEY = 'onsocialWritingShelf';
const WRITING_SHELF_TTL_MS = 2 * 60 * 1000;

type WritingShelfReturn = {
  accountId: string;
  at: number;
};

/** Glass Writing list opened an article — circle-back can restore that stack. */
export function rememberWritingShelf(accountId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const id = accountId.trim();
    if (!id) return;
    const payload: WritingShelfReturn = { accountId: id, at: Date.now() };
    sessionStorage.setItem(WRITING_SHELF_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

/** True once, only for this author's shelf. */
export function consumeWritingShelf(accountId: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(WRITING_SHELF_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<WritingShelfReturn>;
    if (
      typeof parsed.accountId !== 'string' ||
      typeof parsed.at !== 'number' ||
      Date.now() - parsed.at > WRITING_SHELF_TTL_MS
    ) {
      sessionStorage.removeItem(WRITING_SHELF_KEY);
      return false;
    }
    const match = accountIdsEqual(parsed.accountId, accountId);
    if (match) sessionStorage.removeItem(WRITING_SHELF_KEY);
    return match;
  } catch {
    return false;
  }
}
