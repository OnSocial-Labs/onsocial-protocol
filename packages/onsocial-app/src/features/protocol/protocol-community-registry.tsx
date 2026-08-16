'use client';

import { osFieldBorderedClassName } from '@onsocial/ui';
import Link from 'next/link';
import { useId, useState } from 'react';
import {
  PROTOCOL_COMMUNITY_DAO_SEED,
  isValidProtocolDaoAccountId,
  normalizeProtocolDaoAccountId,
  readRecentCommunityDaos,
  rememberCommunityDao,
  resolveKnownBoardForDaoAccount,
} from '@/features/protocol/dao-accounts';
import { daoPath, type ProtocolDaoBoard } from '@/lib/app-routes';

export function ProtocolCommunityRegistry({
  onOpenDao,
}: {
  onOpenDao: (opts: {
    board: ProtocolDaoBoard;
    account?: string | null;
  }) => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState('');
  const [recent, setRecent] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : readRecentCommunityDaos()
  );
  const [error, setError] = useState<string | null>(null);

  const openAccount = (raw: string) => {
    const account = normalizeProtocolDaoAccountId(raw);
    if (!account) {
      setError('Enter a valid NEAR account id.');
      return;
    }
    const known = resolveKnownBoardForDaoAccount(account);
    if (known) {
      onOpenDao({ board: known });
      return;
    }
    rememberCommunityDao(account);
    setRecent(readRecentCommunityDaos());
    setError(null);
    onOpenDao({ board: 'community', account });
  };

  return (
    <div className="protocol-community">
      <p className="protocol-action-lede">
        Open any Sputnik DAO board here, or visit its portfolio page for cover
        and crest. Governance / Treasury stay on their dedicated boards.
      </p>

      <label className="protocol-field" htmlFor={fieldId}>
        <span>DAO account</span>
        <div className="protocol-community-row">
          <input
            id={fieldId}
            type="text"
            className={osFieldBorderedClassName}
            value={draft}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="example.sputnik-dao.near"
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                openAccount(draft);
              }
            }}
          />
          <button
            type="button"
            className="protocol-card-act"
            disabled={!isValidProtocolDaoAccountId(draft)}
            onClick={() => openAccount(draft)}
          >
            Board
          </button>
        </div>
      </label>
      {error ? <p className="protocol-compose-note is-warn">{error}</p> : null}

      <section className="protocol-community-section" aria-label="Known DAOs">
        <h2 className="protocol-community-heading">OnSocial</h2>
        <ul className="protocol-community-list">
          {PROTOCOL_COMMUNITY_DAO_SEED.map((entry) => (
            <li key={entry.accountId}>
              <div className="protocol-community-item protocol-community-item--split">
                <button
                  type="button"
                  className="protocol-community-item-main"
                  onClick={() => openAccount(entry.accountId)}
                >
                  <span className="protocol-community-item-title">
                    {entry.label}
                  </span>
                  <span className="protocol-community-item-meta">
                    @{entry.accountId}
                  </span>
                  <span className="protocol-community-item-desc">
                    {entry.description}
                  </span>
                </button>
                <Link
                  href={daoPath(entry.accountId)}
                  className="protocol-community-page-link"
                >
                  Page
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {recent.length > 0 ? (
        <section className="protocol-community-section" aria-label="Recent DAOs">
          <h2 className="protocol-community-heading">Recent</h2>
          <ul className="protocol-community-list">
            {recent.map((accountId) => (
              <li key={accountId}>
                <div className="protocol-community-item protocol-community-item--split">
                  <button
                    type="button"
                    className="protocol-community-item-main"
                    onClick={() => openAccount(accountId)}
                  >
                    <span className="protocol-community-item-title">
                      @{accountId}
                    </span>
                  </button>
                  <Link
                    href={daoPath(accountId)}
                    className="protocol-community-page-link"
                  >
                    Page
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
