import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthSigClient } from 'authsig';

interface WalletContextType {
  isInitializing: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  publicKey: string | null;
  client: AuthSigClient | null;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [client, setClient] = useState<AuthSigClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-connect silently on mount (skipped after an explicit disconnect)
  useEffect(() => {
    const initWallet = async () => {
      try {
        const authClient = new AuthSigClient();
        setClient(authClient);

        // Try silent reconnect if previously connected
        try {
          if (sessionStorage.getItem('wallet-disconnected') === '1') {
            throw new Error('user disconnected');
          }
          await authClient.connect();
          const identity = authClient.getIdentity() as string | { identityKey?: string } | null;
          const identityKey = typeof identity === 'string' ? identity : identity?.identityKey;
          setPublicKey(identityKey || null);
          setIsConnected(true);
        } catch {
          // Silent fail - user hasn't connected before or wallet not available
          // Silent fail - user hasn't connected before or wallet not available
        }
      } catch {
        // Wallet extension not installed - this is fine
      } finally {
        setIsInitializing(false);
      }
    };
    
    initWallet();
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);
    
    try {
      let authClient = client;
      
      if (!authClient) {
        authClient = new AuthSigClient();
        setClient(authClient);
      }
      
      await authClient.connect();
      const identity = authClient.getIdentity() as string | { identityKey?: string } | null;
      const identityKey = typeof identity === 'string' ? identity : identity?.identityKey;
      setPublicKey(identityKey || null);
      setIsConnected(true);
      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('not installed') || errorMessage.includes('No wallet')) {
        setError('wallet_not_installed');
      } else {
        setError(errorMessage || 'Failed to connect wallet');
      }
      return false;
    } finally {
      try { sessionStorage.removeItem('wallet-disconnected'); } catch { /* ignore */ }
      setIsConnecting(false);
    }
  }, [client]);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setPublicKey(null);
    // Remember the choice so the next page load doesn't silently reconnect.
    try { sessionStorage.setItem('wallet-disconnected', '1'); } catch { /* private mode */ }
  }, []);

  return (
    <WalletContext.Provider value={{
      isInitializing,
      isConnected,
      isConnecting,
      publicKey,
      client,
      connect,
      disconnect,
      error
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
