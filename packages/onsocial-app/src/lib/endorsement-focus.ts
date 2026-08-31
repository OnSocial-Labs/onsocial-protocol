import { parseLegacyEndorsementSpendTargetId } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';
import { endorsementTopicKey } from '@/lib/endorsement-display';
import {
  ENDORSEMENT_FOCUS_PARAM,
  ENDORSEMENT_ISSUER_PARAM,
  ENDORSEMENT_TOPIC_PARAM,
  parsePortfolioEndorsementFocus,
  portfolioEndorsementPath,
  portfolioPath,
  type PortfolioEndorsementFocus,
} from '@/lib/overlay-routes';
import { resolveEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';
import {
  buildPathWithQuery,
  replaceBrowserUrl,
} from '@/lib/sync-browser-url-query';

const ENDORSEMENT_FOCUS_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EndorsementFocusRecord = {
  id?: unknown;
  issuer: string;
  target: string;
  topic?: string | null;
};

export type ExpandedEndorsementFocus = {
  id: string | null;
  uuid: string | null;
  issuer: string | null;
  topic: string | null;
  legacyTarget: string | null;
};

export function expandEndorsementFocus(
  focus: PortfolioEndorsementFocus
): ExpandedEndorsementFocus {
  const id = focus.id?.trim() || null;
  const legacy = id ? parseLegacyEndorsementSpendTargetId(id) : null;
  const uuid =
    id && ENDORSEMENT_FOCUS_UUID_PATTERN.test(id) ? id.toLowerCase() : null;
  return {
    id,
    uuid,
    issuer: focus.issuer?.trim() || legacy?.issuer || null,
    topic: focus.topic?.trim() || legacy?.topic || null,
    legacyTarget: legacy?.target || null,
  };
}

export function endorsementFocusMatchesPage(
  pageAccountId: string,
  focus: PortfolioEndorsementFocus
): boolean {
  const expanded = expandEndorsementFocus(focus);
  if (!expanded.legacyTarget) return true;
  return accountIdsEqual(expanded.legacyTarget, pageAccountId);
}

export function matchEndorsementFocusItem<T extends EndorsementFocusRecord>(
  items: T[],
  focus: PortfolioEndorsementFocus
): T | null {
  const expanded = expandEndorsementFocus(focus);
  const issuer = expanded.issuer?.trim().toLowerCase() || null;
  const topicKey = expanded.topic ? endorsementTopicKey(expanded.topic) : '';

  const candidates = items.filter((item) => {
    if (issuer && item.issuer.trim().toLowerCase() !== issuer) return false;
    if (expanded.legacyTarget && item.target.trim().toLowerCase() !== expanded.legacyTarget.toLowerCase()) {
      return false;
    }
    return true;
  });

  if (expanded.uuid) {
    const byId = candidates.find((item) => {
      const itemId = typeof item.id === 'string' ? item.id.trim().toLowerCase() : '';
      return itemId === expanded.uuid;
    });
    if (byId) return byId;
  }

  if (topicKey) {
    const byTopic = candidates.find(
      (item) => endorsementTopicKey(item.topic) === topicKey
    );
    if (byTopic) return byTopic;
  }

  return candidates[0] ?? null;
}

/** Face share URL for a vouch — recipient host + spend id when we have one. */
export function endorsementFocusSharePath(item: EndorsementFocusRecord): string {
  const spendId = resolveEndorsementSpendTargetId({
    id: typeof item.id === 'string' ? item.id : null,
    issuer: item.issuer,
    target: item.target,
    topic: item.topic,
  });
  return portfolioEndorsementPath(item.target, {
    id: spendId,
    issuer: item.issuer,
    topic: item.topic,
  });
}

/**
 * Drop sticky `?endorsement=` / issuer / topic so closing the sheet does not
 * reopen it. Stays on the face — do not rewrite an open overlay path.
 */
export function clearPortfolioEndorsementFocus(accountId: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (!parsePortfolioEndorsementFocus(params)) return false;

  const face = portfolioPath(accountId);
  const path = window.location.pathname;
  if (path !== face && path !== `/@${accountId}`) return false;

  params.delete(ENDORSEMENT_FOCUS_PARAM);
  params.delete(ENDORSEMENT_ISSUER_PARAM);
  params.delete(ENDORSEMENT_TOPIC_PARAM);
  return replaceBrowserUrl(buildPathWithQuery(face, params));
}
