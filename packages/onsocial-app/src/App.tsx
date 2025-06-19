// App.tsx
import React, { useEffect, useState } from 'react';
import { WalletProvider, useWallet, WalletSetup, PinEntry } from '@onsocial-labs/onsocial-auth';
// You should implement MainWalletScreen in your app
// import { MainWalletScreen } from './components/MainWalletScreen';

const MainWalletScreen = () => (
  <>
    {/* TODO: Replace with your main wallet UI */}
    <h1>Wallet Unlocked!</h1>
  </>
);

const AppContent = () => {
  const wallet = useWallet();
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);

  useEffect(() => {
    wallet.hasWallet().then(setHasWallet);
  }, [wallet]);

  if (hasWallet === null) return null; // or a loading spinner
  if (!hasWallet) return <WalletSetup />;
  if (wallet.isLocked()) return <PinEntry />;
  return <MainWalletScreen />;
};

export default function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}
