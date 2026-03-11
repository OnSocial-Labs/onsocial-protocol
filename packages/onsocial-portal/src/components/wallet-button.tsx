'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Wallet,
  ChevronDown,
  LogOut,
  RefreshCw,
  User,
  ExternalLink,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';

export function WalletButton() {
  const { accountId, isConnected, connect, disconnect } = useWallet();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDisconnect = async () => {
    await disconnect();
    setShowMenu(false);
  };

  const handleSwitchWallet = async () => {
    await disconnect();
    await connect();
    setShowMenu(false);
  };

  if (!isConnected) {
    return (
      <button
        onClick={() => connect()}
        className="flex items-center gap-2 border border-[#60A5FA]/40 bg-[#60A5FA]/[0.06] text-foreground px-4 py-2 rounded-full font-medium transition-all hover:border-[#60A5FA]/60 hover:shadow-md hover:shadow-[#60A5FA]/20 text-sm"
      >
        <Wallet className="w-4 h-4" />
        <span className="hidden sm:inline">Let's connect</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 rounded-full px-3 py-2 border border-border/50 hover:border-border transition-all bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#4ADE80] rounded-full animate-pulse"></div>
          <Wallet className="w-4 h-4 text-[#4ADE80]" />
          <span className="text-foreground text-sm font-medium max-w-[100px] truncate hidden sm:block">
            {accountId}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${showMenu ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div className="absolute right-0 md:right-0 left-0 md:left-auto mt-2 w-full md:w-64 border border-border/50 rounded-2xl bg-card shadow-xl shadow-black/20 z-50 overflow-hidden">
          <div className="p-3 border-b border-border/50">
            <p className="text-xs text-muted-foreground mb-1">
              Connected Account
            </p>
            <p className="text-foreground text-sm font-medium truncate">
              {accountId}
            </p>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                window.open(
                  `https://testnet.nearblocks.io/address/${accountId}`,
                  '_blank'
                );
                setShowMenu(false);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
            >
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                View on Explorer
              </span>
              <ExternalLink className="w-3 h-3 text-muted-foreground/60 ml-auto" />
            </button>

            <button
              onClick={handleSwitchWallet}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Switch Wallet
              </span>
            </button>

            <div className="h-px bg-border/50 my-1"></div>

            <button
              onClick={handleDisconnect}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-red-500/5 transition-colors text-left"
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-500">Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
