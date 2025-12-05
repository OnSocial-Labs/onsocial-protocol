/**
 * React hook for monitoring NEAR Intents swap status
 * 
 * Provides real-time updates on swap progress with automatic polling
 * and cleanup. Use this for displaying swap status in your UI.
 * 
 * @example
 * ```tsx
 * const { status, isLoading, error, startMonitoring } = useSwapStatus();
 * 
 * // Start monitoring after user deposits tokens
 * await startMonitoring(quote.depositAddress);
 * 
 * // Display status in UI
 * {status && <div>Status: {status.status}</div>}
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSwapStatus, SwapStatus, type StatusResponse } from '../services/nearIntents';

interface UseSwapStatusOptions {
  /** Polling interval in milliseconds (default: 5000) */
  pollInterval?: number;
  /** Maximum polling duration in milliseconds (default: 300000 = 5 minutes) */
  maxDuration?: number;
  /** Callback when swap succeeds */
  onSuccess?: (status: StatusResponse) => void;
  /** Callback when swap fails */
  onError?: (error: string) => void;
  /** Callback on each status update */
  onStatusUpdate?: (status: StatusResponse) => void;
}

interface UseSwapStatusReturn {
  /** Current swap status */
  status: StatusResponse | null;
  /** Is currently polling for status updates */
  isLoading: boolean;
  /** Error message if status check failed */
  error: string | null;
  /** Progress percentage (0-100) based on status */
  progress: number;
  /** Human-readable status message */
  statusMessage: string;
  /** Start monitoring a swap by deposit address */
  startMonitoring: (depositAddress: string) => Promise<void>;
  /** Stop monitoring and cleanup */
  stopMonitoring: () => void;
  /** Reset to initial state */
  reset: () => void;
}

export function useSwapStatus(options: UseSwapStatusOptions = {}): UseSwapStatusReturn {
  const {
    pollInterval = 5000,
    maxDuration = 300000, // 5 minutes
    onSuccess,
    onError,
    onStatusUpdate,
  } = options;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const depositAddressRef = useRef<string | null>(null);

  /**
   * Calculate progress percentage based on status
   */
  const calculateProgress = useCallback((swapStatus: SwapStatus): number => {
    switch (swapStatus) {
      case SwapStatus.PENDING_DEPOSIT:
        return 10;
      case SwapStatus.PROCESSING:
        return 50;
      case SwapStatus.SUCCESS:
        return 100;
      case SwapStatus.FAILED:
      case SwapStatus.REFUNDED:
      case SwapStatus.INCOMPLETE_DEPOSIT:
        return 0;
      default:
        return 0;
    }
  }, []);

  /**
   * Get human-readable status message
   */
  const getStatusMessage = useCallback((swapStatus: SwapStatus): string => {
    switch (swapStatus) {
      case SwapStatus.PENDING_DEPOSIT:
        return 'Waiting for deposit confirmation...';
      case SwapStatus.PROCESSING:
        return 'Solvers are swapping your tokens...';
      case SwapStatus.SUCCESS:
        return 'Swap completed successfully!';
      case SwapStatus.FAILED:
        return 'Swap failed. Please try again.';
      case SwapStatus.REFUNDED:
        return 'Swap was refunded to your account.';
      case SwapStatus.INCOMPLETE_DEPOSIT:
        return 'Deposit amount was insufficient.';
      default:
        return 'Unknown status';
    }
  }, []);

  /**
   * Check swap status once
   */
  const checkStatus = useCallback(async (depositAddress: string) => {
    try {
      const statusResponse = await getSwapStatus(depositAddress);
      setStatus(statusResponse);
      setProgress(calculateProgress(statusResponse.status));
      setStatusMessage(getStatusMessage(statusResponse.status));

      // Call update callback
      onStatusUpdate?.(statusResponse);

      // Check for terminal states
      if (statusResponse.status === SwapStatus.SUCCESS) {
        setIsLoading(false);
        onSuccess?.(statusResponse);
        return true; // Terminal state reached
      } else if (
        statusResponse.status === SwapStatus.FAILED ||
        statusResponse.status === SwapStatus.REFUNDED ||
        statusResponse.status === SwapStatus.INCOMPLETE_DEPOSIT
      ) {
        setIsLoading(false);
        const errorMsg = statusResponse.error || getStatusMessage(statusResponse.status);
        setError(errorMsg);
        onError?.(errorMsg);
        return true; // Terminal state reached
      }

      return false; // Continue polling
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to check swap status';
      setError(errorMsg);
      setIsLoading(false);
      onError?.(errorMsg);
      return true; // Stop polling on error
    }
  }, [calculateProgress, getStatusMessage, onSuccess, onError, onStatusUpdate]);

  /**
   * Start monitoring swap status
   */
  const startMonitoring = useCallback(
    async (depositAddress: string) => {
      // Cleanup any existing monitoring
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      depositAddressRef.current = depositAddress;
      startTimeRef.current = Date.now();
      setIsLoading(true);
      setError(null);
      setStatus(null);
      setProgress(0);

      // Check status immediately
      const isTerminal = await checkStatus(depositAddress);
      if (isTerminal) {
        return;
      }

      // Start polling
      intervalRef.current = setInterval(async () => {
        const elapsed = Date.now() - (startTimeRef.current || 0);

        // Check if max duration exceeded
        if (elapsed > maxDuration) {
          setIsLoading(false);
          setError('Swap status check timeout. Please check your wallet for updates.');
          onError?.('Timeout waiting for swap completion');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }

        // Check status
        const isTerminal = await checkStatus(depositAddress);
        if (isTerminal && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, pollInterval);
    },
    [checkStatus, pollInterval, maxDuration, onError]
  );

  /**
   * Stop monitoring and cleanup
   */
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsLoading(false);
  }, []);

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    stopMonitoring();
    setStatus(null);
    setError(null);
    setProgress(0);
    setStatusMessage('');
    depositAddressRef.current = null;
    startTimeRef.current = null;
  }, [stopMonitoring]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    status,
    isLoading,
    error,
    progress,
    statusMessage,
    startMonitoring,
    stopMonitoring,
    reset,
  };
}

/**
 * Example usage in a component:
 * 
 * ```tsx
 * function NFTPurchase({ nftId, price }) {
 *   const { 
 *     status, 
 *     isLoading, 
 *     error, 
 *     progress, 
 *     statusMessage,
 *     startMonitoring 
 *   } = useSwapStatus({
 *     onSuccess: (finalStatus) => {
 *       console.log('Purchase complete!', finalStatus);
 *       // Redirect to NFT page or refresh data
 *     },
 *     onError: (error) => {
 *       console.error('Purchase failed:', error);
 *       // Show error notification
 *     },
 *   });
 * 
 *   const handlePurchase = async () => {
 *     const quote = await getQuote({ ... });
 *     // User deposits tokens
 *     await startMonitoring(quote.depositAddress);
 *   };
 * 
 *   return (
 *     <div>
 *       <button onClick={handlePurchase}>Buy NFT</button>
 *       
 *       {isLoading && (
 *         <div className="swap-progress">
 *           <progress value={progress} max={100} />
 *           <p>{statusMessage}</p>
 *           {status && (
 *             <div>
 *               <p>Status: {status.status}</p>
 *               {status.amountIn && <p>Deposited: {status.amountIn}</p>}
 *               {status.amountOut && <p>Received: {status.amountOut}</p>}
 *             </div>
 *           )}
 *         </div>
 *       )}
 *       
 *       {error && (
 *         <div className="error">
 *           <p>{error}</p>
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
