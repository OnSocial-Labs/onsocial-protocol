'use client';

import { useEffect, useId, useState } from 'react';
import {
  PROTOCOL_COMMUNITY_DAO_SEED,
  isValidProtocolDaoAccountId,
  normalizeProtocolDaoAccountId,
  readRecentCommunityDaos,
  rememberCommunityDao,
  resolveKnownBoardForDaoAccount,
} from '@/features/protocol/dao-accounts';
import type { ProtocolDaoBoard } from '@/lib/app-routes';

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
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecent(readRecentCommunityDaos());
  }, []);

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
        Open any Sputnik DAO by account. Known OnSocial boards stay on
        Governance / Treasury; everything else opens here.
      </p>

      <label className="protocol-field" htmlFor={fieldId}>
        <span>DAO account</span>
        <div className="protocol-community-row">
          <input
            id={fieldId}
            type="text"
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
            Open
          </button>
        </div>
      </label>
      {error ? <p className="protocol-compose-note is-warn">{error}</p> : null}

      <section className="protocol-community-section" aria-label="Known DAOs">
        <h2 className="protocol-community-heading">OnSocial</h2>
        <ul className="protocol-community-list">
          {PROTOCOL_COMMUNITY_DAO_SEED.map((entry) => (
            <li key={entry.accountId}>
              <button
                type="button"
                className="protocol-community-item"
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
                <button
                  type="button"
                  className="protocol-community-item"
                  onClick={() => openAccount(accountId)}
                >
                  <span className="protocol-community-item-title">
                    @{accountId}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
