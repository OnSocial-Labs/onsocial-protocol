'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

const EXAMPLE_ACCOUNTS = ['greenghost.testnet', 'alice.testnet', 'bob.testnet'];

function normalizeAccountInput(value: string): string | null {
  const trimmed = value.trim().replace(/^@+/, '');

  if (!trimmed) {
    return null;
  }

  return trimmed;
}

export function AccountEntry() {
  const router = useRouter();
  const [accountId, setAccountId] = useState('greenghost.testnet');

  function openAccount(nextAccountId: string) {
    const normalizedAccountId = normalizeAccountInput(nextAccountId);
    if (!normalizedAccountId) {
      return;
    }

    router.push(`/@${encodeURIComponent(normalizedAccountId)}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openAccount(accountId);
  }

  return (
    <div className="gate-panel animate-rise-in">
      <form className="gate-form" onSubmit={handleSubmit}>
        <label className="gate-label" htmlFor="accountId">
          Open a live page
        </label>
        <div className="gate-field-row">
          <span className="gate-prefix">@</span>
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            className="gate-input"
            id="accountId"
            inputMode="text"
            name="accountId"
            onChange={(event) => setAccountId(event.target.value)}
            placeholder="user.testnet"
            spellCheck={false}
            type="text"
            value={accountId}
          />
          <button className="gate-cta" type="submit">
            View Page
          </button>
        </div>
      </form>

      <div className="gate-hints" role="list" aria-label="Example accounts">
        {EXAMPLE_ACCOUNTS.map((exampleAccountId) => (
          <button
            key={exampleAccountId}
            className="gate-chip"
            onClick={() => openAccount(exampleAccountId)}
            type="button"
          >
            @{exampleAccountId}
          </button>
        ))}
      </div>
    </div>
  );
}
