// App.tsx
import React, { useEffect, useState } from 'react';
// TODO: Implement auth - onsocial-auth was removed
// import { useAuth } from 'onsocial-auth';
const useAuth = () => ({ jwt: null, loading: false }); // Stub

const MainWalletScreen = () => (
  <>
    {/* TODO: Replace with your main wallet UI */}
    <h1>Wallet Unlocked!</h1>
  </>
);

const LoadingScreen = () => (
  <>
    <h1>Loading...</h1>
  </>
);

const LoginScreen = () => (
  <>
    <h1>Please login to continue</h1>
    {/* TODO: Add login functionality */}
  </>
);

const AppContent = () => {
  const { jwt, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!jwt) return <LoginScreen />;
  return <MainWalletScreen />;
};

export default function App() {
  return <AppContent />;
}
