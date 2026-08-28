'use client';

import { useCallback, useEffect, useState } from 'react';
import { Divider } from '@onsocial/ui';
import { DaoPageSlideOverScreen } from '@/features/protocol/dao-page-slide-over-screen';
import {
  formatTreasuryAssetCompact,
  formatTreasuryAssetExact,
  isNearTreasuryAsset,
} from '@/features/protocol/dao-treasury-format';
import { fetchProtocolDaoTransferAssets } from '@/features/protocol/protocol-dao-context-client';
import {
  readDaoTreasuryCache,
  writeDaoTreasuryCache,
} from '@/lib/dao-workspace-prefetch';
import {
  nearAccountExplorerHref,
  nearFtExplorerHref,
} from '@/lib/app-near-account-facts';
import { formatSocialCompact } from '@/lib/format-social-balance';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';
import { SHEET_Z } from '@/lib/sheet-z';
import { fetchProfileSupportBalanceYocto } from '@/lib/social-spend-profile';

const TREASURY_Z = SHEET_Z.board;

function treasuryAssetExplorerHref(
  asset: ProtocolDaoTransferAsset,
  accountId: string
): string {
  if (isNearTreasuryAsset(asset)) {
    return nearAccountExplorerHref(accountId);
  }
  return nearFtExplorerHref(asset.tokenId);
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
  const cachedTreasury = readDaoTreasuryCache(daoAccountId);
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

  const [assets, setAssets] = useState<ProtocolDaoTransferAsset[] | null>(
    () => cachedTreasury?.assets ?? null
  );
  const [supportYocto, setSupportYocto] = useState<bigint | null>(() =>
    cachedTreasury ? BigInt(cachedTreasury.supportYocto) : null
  );
  const [pending, setPending] = useState(() => cachedTreasury == null);
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
    const cached = readDaoTreasuryCache(daoAccountId);
    if (cached) {
      queueMicrotask(() => {
        if (cancelled) return;
        setAssets(cached.assets);
        setSupportYocto(BigInt(cached.supportYocto));
        setPending(false);
        setError(null);
      });
    } else {
      queueMicrotask(() => {
        if (!cancelled) {
          setPending(true);
          setError(null);
        }
      });
    }
    void Promise.all([
      fetchProtocolDaoTransferAssets(daoAccountId),
      fetchProfileSupportBalanceYocto(daoAccountId, { fresh: true }).catch(
        () => 0n
      ),
    ])
      .then(([nextAssets, nextSupport]) => {
        if (cancelled) return;
        writeDaoTreasuryCache(daoAccountId, {
          assets: nextAssets,
          supportYocto: nextSupport.toString(),
        });
        setAssets(nextAssets);
        setSupportYocto(nextSupport);
        setPending(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        if (readDaoTreasuryCache(daoAccountId)) {
          setPending(false);
          return;
        }
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
    <DaoPageSlideOverScreen
      pageAccountId={daoAccountId}
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      title="Treasury"
      subtitle={daoName?.trim() || daoAccountId}
      closeAriaLabel="Back from treasury"
      zIndex={TREASURY_Z}
      className="dao-treasury-slide"
      contentClassName="dao-treasury-sheet"
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
          <div className="standing-list dao-treasury-list">
            <div className="standing-row">
              <div className="standing-row-main">
                <div className="standing-row-copy">
                  <div className="standing-row-head">
                    <span className="standing-row-name">SOCIAL</span>
                    <span className="standing-row-handle">
                      Visitor Support · claim via Manage
                    </span>
                  </div>
                </div>
              </div>
              <div className="standing-row-aside">
                <span className="dao-treasury-balance">
                  {formatSocialCompact(supportYocto!.toString())}
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {hasAssets ? (
        <section className="dao-treasury-section" aria-label="Wallet">
          <h2 className="dao-treasury-section-title">Wallet</h2>
          <div className="standing-list dao-treasury-list">
            {assets!.map((asset, index) => {
              const exact = formatTreasuryAssetExact(asset);
              const name = asset.name.trim();
              const symbol = asset.symbol.trim();
              return (
                <div key={asset.tokenId || 'near'}>
                  {index > 0 ? <Divider variant="item" /> : null}
                  <a
                    className="standing-row dao-treasury-token-row"
                    href={treasuryAssetExplorerHref(asset, daoAccountId)}
                    target="_blank"
                    rel="noreferrer"
                    title={exact}
                    aria-label={`${exact} on Nearblocks`}
                  >
                    <span className="standing-row-main">
                      <span className="standing-row-copy">
                        <span className="standing-row-head">
                          <span className="standing-row-name">{symbol}</span>
                          {name && name !== symbol ? (
                            <span className="standing-row-handle">{name}</span>
                          ) : null}
                        </span>
                      </span>
                    </span>
                    <span className="standing-row-aside">
                      <span className="dao-treasury-balance">{formatTreasuryAssetCompact(asset)}</span>
                    </span>
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </DaoPageSlideOverScreen>
  );
}
