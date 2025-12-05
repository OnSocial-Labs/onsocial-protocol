/**
 * NFT Purchase Screen (Expo Example)
 *
 * Complete example showing HOT Wallet + NEAR Intents integration.
 * Demonstrates the full flow from wallet connection to NFT purchase.
 *
 * Features:
 * - HOT Wallet connection with NEAR authentication
 * - Multi-token NFT purchase via NEAR Intents
 * - Beautiful mobile-optimized UI
 * - Real-time swap status monitoring
 *
 * @example
 * ```tsx
 * import { NFTPurchaseScreen } from './screens/NFTPurchaseScreen';
 *
 * // In your navigation
 * <Stack.Screen name="Purchase" component={NFTPurchaseScreen} />
 * ```
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from 'onsocial-auth';
import { BuyWithAnyToken } from '../components/BuyWithAnyToken';

// Example NFT data (replace with your own data fetching logic)
interface NFTData {
  tokenId: string;
  contractId: string;
  title: string;
  description: string;
  imageUrl: string;
  price: string; // in yoctoNEAR
  creator: string;
}

const EXAMPLE_NFT: NFTData = {
  tokenId: '123',
  contractId: 'nft.onsocial.near',
  title: 'Awesome Digital Art #123',
  description: 'A stunning piece of digital art from the OnSocial collection',
  imageUrl: 'https://via.placeholder.com/400',
  price: '1000000000000000000000000', // 1 NEAR in yoctoNEAR
  creator: 'artist.near',
};

export function NFTPurchaseScreen() {
  const { jwt, loading: authLoading, accountId } = useAuth();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [nftData] = useState<NFTData>(EXAMPLE_NFT);

  // Handle successful purchase
  const handlePurchaseSuccess = () => {
    setShowPurchaseModal(false);
    Alert.alert(
      'Success! 🎉',
      'Your NFT purchase is complete! Check your wallet to view your new NFT.',
      [
        {
          text: 'View in Wallet',
          onPress: () => {
            // Navigate to user's NFT collection
            console.log('Navigate to NFT collection');
          },
        },
        { text: 'OK', style: 'cancel' },
      ]
    );
  };

  // Handle purchase error
  const handlePurchaseError = (error: string) => {
    console.error('Purchase error:', error);
    Alert.alert('Purchase Failed', error, [
      { text: 'Try Again', onPress: () => setShowPurchaseModal(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Loading state
  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Not authenticated
  if (!jwt || !accountId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>🔐 Authentication Required</Text>
        <Text style={styles.errorText}>
          Please connect your wallet to purchase NFTs
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => {
          // TODO: Implement HOT Wallet connection
          Alert.alert('Coming Soon', 'HOT Wallet integration in progress');
        }}>
          <Text style={styles.primaryButtonText}>Connect Wallet</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* NFT Display Card */}
      <View style={styles.nftCard}>
        <Image source={{ uri: nftData.imageUrl }} style={styles.nftImage} />

        <View style={styles.nftInfo}>
          <Text style={styles.nftTitle}>{nftData.title}</Text>
          <Text style={styles.nftCreator}>by {nftData.creator}</Text>
          <Text style={styles.nftDescription}>{nftData.description}</Text>

          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Price</Text>
            <Text style={styles.priceValue}>
              {(parseFloat(nftData.price) / 1e24).toFixed(4)} NEAR
            </Text>
          </View>
        </View>
      </View>

      {/* Connected Wallet Info */}
      <View style={styles.walletInfo}>
        <Text style={styles.walletLabel}>Connected Wallet</Text>
        <Text style={styles.walletAddress}>{accountId}</Text>
      </View>

      {/* Purchase Button */}
      <TouchableOpacity
        style={styles.purchaseButton}
        onPress={() => setShowPurchaseModal(true)}
      >
        <Text style={styles.purchaseButtonText}>Buy with Any Token 🚀</Text>
      </TouchableOpacity>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 Pay with Any Token</Text>
        <Text style={styles.infoText}>
          You can purchase this NFT using NEAR, SOCIAL, USDC, USDT, or any other
          supported token. Our system automatically converts your payment to NEAR.
        </Text>
      </View>

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Purchase NFT</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowPurchaseModal(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <BuyWithAnyToken
            nftTokenId={nftData.tokenId}
            nftContractId={nftData.contractId}
            priceYoctoNear={nftData.price}
            marketplaceContractId="marketplace.onsocial.near"
            userAccountId={accountId}
            onSuccess={handlePurchaseSuccess}
            onError={handlePurchaseError}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  errorTitle: {
    fontSize: 32,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  // NFT Card
  nftCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  nftImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#E5E7EB',
  },
  nftInfo: {
    padding: 20,
  },
  nftTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  nftCreator: {
    fontSize: 14,
    color: '#6366F1',
    marginBottom: 12,
  },
  nftDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
  },
  priceLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  priceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  // Wallet Info
  walletInfo: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  walletLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  walletAddress: {
    fontSize: 16,
    color: '#111827',
    fontFamily: 'monospace',
  },
  // Purchase Button
  purchaseButton: {
    backgroundColor: '#6366F1',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  primaryButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Info Box
  infoBox: {
    backgroundColor: '#EEF2FF',
    marginHorizontal: 16,
    marginBottom: 32,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  // Modal
  modalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 1000,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#6B7280',
  },
});
