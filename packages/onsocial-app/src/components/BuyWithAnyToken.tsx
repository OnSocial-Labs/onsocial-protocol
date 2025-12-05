/**
 * BuyWithAnyToken Component (React Native/Expo)
 *
 * Mobile-optimized component for purchasing NFTs with any supported token.
 * Uses NEAR Intents (1Click API) to enable multi-token payments.
 *
 * Flow:
 * 1. User selects payment token (NEAR, SOCIAL, USDC, etc.)
 * 2. Request quote from 1Click API
 * 3. Display deposit instructions (address, amount, deadline)
 * 4. Monitor swap status with useSwapStatus hook
 * 5. Notify on completion or error
 *
 * @example
 * ```tsx
 * <BuyWithAnyToken
 *   nftTokenId="123"
 *   nftContractId="nft.onsocial.near"
 *   priceYoctoNear="1000000000000000000000000"
 *   marketplaceContractId="marketplace.onsocial.near"
 *   userAccountId="alice.near"
 *   onSuccess={() => console.log('NFT purchased!')}
 *   onError={(error) => console.error('Purchase failed:', error)}
 * />
 * ```
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  Clipboard,
} from 'react-native';
import { getQuote, type QuoteResponse } from '../services/nearIntents';
import {
  SUPPORTED_TOKENS,
  getDefaultToken,
  formatTokenAmount,
  type TokenConfig,
} from '../config/supportedTokens';
import { useSwapStatus } from '../hooks/useSwapStatus';

interface BuyWithAnyTokenProps {
  /** NFT token ID to purchase */
  nftTokenId: string;
  /** NFT contract address */
  nftContractId: string;
  /** NFT price in yoctoNEAR (NEAR's smallest unit: 1 NEAR = 10^24 yoctoNEAR) */
  priceYoctoNear: string;
  /** Marketplace contract address (receives NEAR payment) */
  marketplaceContractId: string;
  /** User's NEAR account ID */
  userAccountId: string;
  /** Callback when purchase succeeds */
  onSuccess?: () => void;
  /** Callback when purchase fails */
  onError?: (error: string) => void;
}

type PurchaseStep =
  | 'select-token'
  | 'requesting-quote'
  | 'waiting-deposit'
  | 'processing-swap';

export function BuyWithAnyToken({
  nftTokenId,
  nftContractId,
  priceYoctoNear,
  marketplaceContractId,
  userAccountId,
  onSuccess,
  onError,
}: BuyWithAnyTokenProps) {
  const [currentStep, setCurrentStep] = useState<PurchaseStep>('select-token');
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(getDefaultToken());
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { status: swapStatus, progress, statusMessage, startMonitoring } = useSwapStatus({
    onSuccess: () => {
      Alert.alert('Success! 🎉', 'NFT purchased successfully!');
      onSuccess?.();
    },
    onError: (error) => {
      Alert.alert('Purchase Failed', error);
      onError?.(error);
      setLocalError(error);
    },
  });

  /**
   * Step 1: Request quote from 1Click API
   */
  const handleRequestQuote = async () => {
    try {
      setCurrentStep('requesting-quote');
      setLocalError(null);

      const quoteResponse = await getQuote({
        dry: false, // Set to true for testing
        swapType: 'EXACT_OUTPUT', // We need exact NEAR amount for NFT price
        originAsset: selectedToken.assetId,
        destinationAsset: 'near',
        amount: priceYoctoNear,
        recipient: marketplaceContractId,
        recipientType: 'INTENTS',
        refundTo: userAccountId,
        refundType: 'INTENTS',
        slippageTolerance: 100, // 1% slippage
        deadline: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      });

      setQuote(quoteResponse);
      setCurrentStep('waiting-deposit');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get quote';
      setLocalError(message);
      Alert.alert('Error', message);
      onError?.(message);
      setCurrentStep('select-token');
    }
  };

  /**
   * Step 2: User confirms they made the deposit
   * Start monitoring swap status
   */
  const handleDepositConfirmed = async () => {
    if (!quote) return;

    try {
      setCurrentStep('processing-swap');
      await startMonitoring(quote.depositAddress);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to monitor swap';
      setLocalError(message);
      Alert.alert('Error', message);
      onError?.(message);
    }
  };

  /**
   * Copy address to clipboard
   */
  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied!', 'Address copied to clipboard');
  };

  /**
   * Reset to initial state
   */
  const handleReset = () => {
    setCurrentStep('select-token');
    setQuote(null);
    setLocalError(null);
  };

  // Token Picker Modal Component
  const renderTokenPicker = () => (
    <Modal
      visible={showTokenPicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowTokenPicker(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Payment Token</Text>
          <ScrollView style={styles.tokenList}>
            {SUPPORTED_TOKENS.map((token) => (
              <TouchableOpacity
                key={token.symbol}
                style={[
                  styles.tokenItem,
                  selectedToken.symbol === token.symbol && styles.tokenItemSelected,
                ]}
                onPress={() => {
                  setSelectedToken(token);
                  setShowTokenPicker(false);
                }}
              >
                <Text style={styles.tokenIcon}>{token.icon}</Text>
                <View style={styles.tokenInfo}>
                  <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                  <Text style={styles.tokenName}>{token.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setShowTokenPicker(false)}
          >
            <Text style={styles.modalCloseButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Step 1: Token Selection
  const renderTokenSelection = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Select Payment Token</Text>

      <TouchableOpacity
        style={styles.tokenSelector}
        onPress={() => setShowTokenPicker(true)}
      >
        <Text style={styles.tokenSelectorIcon}>{selectedToken.icon}</Text>
        <View style={styles.tokenSelectorInfo}>
          <Text style={styles.tokenSelectorSymbol}>{selectedToken.symbol}</Text>
          <Text style={styles.tokenSelectorName}>{selectedToken.name}</Text>
        </View>
        <Text style={styles.tokenSelectorArrow}>▼</Text>
      </TouchableOpacity>

      <View style={styles.priceInfo}>
        <Text style={styles.priceLabel}>NFT Price</Text>
        <Text style={styles.priceValue}>
          {formatTokenAmount(priceYoctoNear, getDefaultToken())}
        </Text>
        {selectedToken.symbol !== 'NEAR' && (
          <Text style={styles.priceNote}>
            You'll pay the equivalent in {selectedToken.symbol} (exact amount shown after
            quote)
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleRequestQuote}
        disabled={currentStep !== 'select-token'}
      >
        <Text style={styles.primaryButtonText}>Get Quote</Text>
      </TouchableOpacity>
    </View>
  );

  // Step 2: Loading Quote
  const renderRequestingQuote = () => (
    <View style={styles.stepContainer}>
      <ActivityIndicator size="large" color="#6366F1" />
      <Text style={styles.loadingText}>Requesting quote from solvers...</Text>
      <Text style={styles.loadingSubtext}>This usually takes a few seconds</Text>
    </View>
  );

  // Step 3: Deposit Instructions
  const renderDepositInstructions = () => {
    if (!quote) return null;

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>📤 Send Payment</Text>

        <View style={styles.quoteDetails}>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>You pay:</Text>
            <Text style={styles.quoteValue}>
              {formatTokenAmount(quote.amountIn, selectedToken)}
            </Text>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Marketplace receives:</Text>
            <Text style={styles.quoteValue}>
              {formatTokenAmount(quote.amountOut, getDefaultToken())}
            </Text>
          </View>

          <View style={styles.addressContainer}>
            <Text style={styles.quoteLabel}>Send to address:</Text>
            <TouchableOpacity
              style={styles.addressBox}
              onPress={() => copyToClipboard(quote.depositAddress)}
            >
              <Text style={styles.addressText}>{quote.depositAddress}</Text>
              <Text style={styles.copyIcon}>📋</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Deadline:</Text>
            <Text style={styles.quoteValueSmall}>
              {new Date(quote.deadline).toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.instructionBox}>
          <Text style={styles.instructionTitle}>⚠️ Important</Text>
          <Text style={styles.instructionText}>
            1. Send exactly {formatTokenAmount(quote.amountIn, selectedToken)} to the address
            above
          </Text>
          <Text style={styles.instructionText}>
            2. Use your wallet app to complete the transfer
          </Text>
          <Text style={styles.instructionText}>
            3. Come back and tap "I've Sent Payment" below
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleDepositConfirmed}
        >
          <Text style={styles.primaryButtonText}>I've Sent Payment</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleReset}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Step 4: Processing Swap
  const renderProcessingSwap = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>⚙️ Processing Swap</Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>{progress}%</Text>
      </View>

      {statusMessage && (
        <Text style={styles.statusMessage}>{statusMessage}</Text>
      )}

      {swapStatus && (
        <View style={styles.statusDetails}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status:</Text>
            <Text style={styles.statusValue}>{swapStatus.status}</Text>
          </View>
          {swapStatus.amountIn && (
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Deposited:</Text>
              <Text style={styles.statusValue}>
                {formatTokenAmount(swapStatus.amountIn, selectedToken)}
              </Text>
            </View>
          )}
          {swapStatus.amountOut && (
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Swapped:</Text>
              <Text style={styles.statusValue}>
                {formatTokenAmount(swapStatus.amountOut, getDefaultToken())}
              </Text>
            </View>
          )}
        </View>
      )}

      <ActivityIndicator size="large" color="#6366F1" style={styles.spinner} />
      <Text style={styles.loadingSubtext}>
        This may take a few minutes. Please don't close the app.
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={styles.title}>Buy NFT with Any Token</Text>

      {localError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ {localError}</Text>
        </View>
      )}

      {currentStep === 'select-token' && renderTokenSelection()}
      {currentStep === 'requesting-quote' && renderRequestingQuote()}
      {currentStep === 'waiting-deposit' && renderDepositInstructions()}
      {currentStep === 'processing-swap' && renderProcessingSwap()}

      {renderTokenPicker()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  stepContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  // Token Selector
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  tokenSelectorIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  tokenSelectorInfo: {
    flex: 1,
  },
  tokenSelectorSymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  tokenSelectorName: {
    fontSize: 14,
    color: '#6B7280',
  },
  tokenSelectorArrow: {
    fontSize: 16,
    color: '#6B7280',
  },
  // Price Info
  priceInfo: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  priceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  priceNote: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  // Buttons
  primaryButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  // Quote Details
  quoteDetails: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quoteLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  quoteValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  quoteValueSmall: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  // Address
  addressContainer: {
    marginBottom: 12,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addressText: {
    flex: 1,
    fontSize: 12,
    color: '#111827',
    fontFamily: 'monospace',
  },
  copyIcon: {
    fontSize: 20,
    marginLeft: 8,
  },
  // Instructions
  instructionBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 4,
  },
  // Loading
  loadingText: {
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  // Progress
  progressContainer: {
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
  },
  progressText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  statusMessage: {
    fontSize: 15,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  // Status Details
  statusDetails: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  spinner: {
    marginVertical: 20,
  },
  // Error
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#991B1B',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  tokenList: {
    maxHeight: 400,
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tokenItemSelected: {
    backgroundColor: '#EEF2FF',
  },
  tokenIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  tokenName: {
    fontSize: 13,
    color: '#6B7280',
  },
  modalCloseButton: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    alignItems: 'center',
    margin: 20,
    borderRadius: 12,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
});
