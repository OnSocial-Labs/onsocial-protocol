'use client';

import { useCallback, useEffect, useState } from 'react';
import { Divider, OsSurfaceRow, OsSurfaceRowList } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { fetchProtocolDaoTransferAssets } from '@/features/protocol/protocol-dao-context-client';
import { formatSocialCompact } from '@/lib/format-social-balance';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';
import { fetchProfileSupportBalanceYocto } from '@/lib/social-spend-profile';

const TREASURY_Z = 74;

function tokenSmallestToDisplay(value: string, decimals: number): string {
  if (!value || value === '0') return '0';
  const safeDecimals = Math.max(0, Math.floor(decimals));
  if (safeDecimals === 0) return value.replace(/^0+/, '') || '0';
  const padded = value.padStart(safeDecimals + 1, '0');
  const whole = padded.slice(0, padded.length - safeDecimals) || '0';
  const fraction = padded
    .slice(padded.length - safeDecimals)
    .replace(/0+$/, '')
    .slice(0, 6);
  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * DAO treasury — wallet balances + Support pot (claim moves pot → wallet).
 */
export function DaoTreasurySheet({
  open,
  daoAccountId,
  daoName,
  onClose,
}: {
  open: boolean;
  daoAccountId: string;
  daoName?: string;
  onClose: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

  const [assets, setAssets] = useState<ProtocolDaoTransferAsset[] | null>(null);
  const [supportYocto, setSupportYocto] = useState<bigint | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setAssets(null);
    setSupportYocto(null);
    setError(null);
    setPending(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!sheetOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
      }
    });
    void Promise.all([
      fetchProtocolDaoTransferAssets(daoAccountId),
      fetchProfileSupportBalanceYocto(daoAccountId, { fresh: true }).catch(
        () => 0n
      ),
    ])
      .then(([nextAssets, nextSupport]) => {
        if (cancelled) return;
        setAssets(nextAssets);
        setSupportYocto(nextSupport);
        setPending(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setPending(false);
        setError(
          cause instanceof Error ? cause.message : 'Could not load treasury.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [sheetOpen, daoAccountId]);

  const hasAssets = Boolean(assets && assets.length > 0);
  const hasSupport = supportYocto != null && supportYocto > 0n;
  const empty =
    !pending &&
    !error &&
    assets != null &&
    supportYocto != null &&
    !hasAssets &&
    !hasSupport;

  return (
    <OsSlideOverScreen
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      title="Treasury"
      subtitle={daoName?.trim() || daoAccountId}
      closeAriaLabel="Back from treasury"
      zIndex={TREASURY_Z}
      className="dao-treasury-slide"
      contentClassName="dao-treasury-sheet standing-panel"
    >
      {pending && assets == null ? (
        <p className="dao-treasury-empty">Loading balances…</p>
      ) : null}

      {error ? (
        <p className="dao-treasury-error" role="alert">
          {error}
        </p>
      ) : null}

      {empty ? (
        <p className="dao-treasury-empty">No spendable balances found.</p>
      ) : null}

      {hasSupport ? (
        <section className="dao-treasury-section" aria-label="Support pot">
          <h2 className="dao-treasury-section-title">Support pot</h2>
          <OsSurfaceRowList
            className="dao-treasury-list"
            aria-label="Support pot balance"
          >
            <OsSurfaceRow
              label="SOCIAL"
              description="Visitor Support · claim via Manage"
              trailing={
                <span className="dao-treasury-balance">
                  {formatSocialCompact(supportYocto!.toString())}
                </span>
              }
            />
          </OsSurfaceRowList>
        </section>
      ) : null}

      {hasAssets ? (
        <section className="dao-treasury-section" aria-label="Wallet">
          <h2 className="dao-treasury-section-title">Wallet</h2>
          <OsSurfaceRowList
            className="dao-treasury-list"
            aria-label="DAO wallet balances"
          >
            {assets!.map((asset, index) => (
              <div key={asset.tokenId || 'near'}>
                {index > 0 ? <Divider variant="item" /> : null}
                <OsSurfaceRow
                  label={asset.symbol}
                  description={
                    asset.name !== asset.symbol ? asset.name : undefined
                  }
                  trailing={
                    <span className="dao-treasury-balance">
                      {tokenSmallestToDisplay(
                        asset.balanceSmallest,
                        asset.decimals
                      )}
                    </span>
                  }
                />
              </div>
            ))}
          </OsSurfaceRowList>
        </section>
      ) : null}
    </OsSlideOverScreen>
  );
}
