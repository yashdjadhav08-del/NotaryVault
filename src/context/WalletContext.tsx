import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  MST_NETWORKS,
  isChainIdMatchingNetwork,
  getContractAdmin,
  checkIsOnChainAuthor,
  isContractConfigured,
  getOnChainSuperAuthor,
  getContractAddressForNetwork,
  verifyContractCapabilities,
  type MSTNetworkKey,
  type MSTNetworkDefinition
} from '../services/contractService';
import type { AuthorRole } from '../types';

export type WalletConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type { MSTNetworkKey, MSTNetworkDefinition };

export interface WalletContextType {
  status: WalletConnectionStatus;
  address: string | null;
  chainId: string | null;
  isMSTNetwork: boolean;
  isCorrectNetwork: boolean;
  selectedNetwork: MSTNetworkKey;
  detectedNetworkKey: MSTNetworkKey | null;
  activeNetworkConfig: MSTNetworkDefinition;
  setSelectedNetwork: (net: MSTNetworkKey) => void;
  walletName: string | null;
  isBridgeKeyDetected: boolean;
  isProviderAvailable: boolean;
  provider: any;
  error: string | null;
  contractAdminAddress: string | null;
  contractAddress: string;
  contractVerificationStatus: 'checking' | 'verified' | 'unverified' | 'rpc_error' | 'not_configured';
  contractVerificationError: string | null;
  isAdminWallet: boolean;
  isRegistrar: boolean;
  role: AuthorRole;
  isSuperAuthor: boolean;
  isSecondaryAuthor: boolean;
  isAuthor: boolean;
  isPublicUser: boolean;
  onChainSuperAuthorAddress: string | null;
  isVerifiedOnChainSuperAuthor: boolean;
  canDeployMainnetContract: boolean;
  refreshAuthorRoles: () => void;
  refreshContractConfig: () => void;
  connectWallet: () => Promise<void>;
  cancelConnection: () => void;
  disconnectWallet: () => void;
  switchNetworkToMST: (targetNet?: MSTNetworkKey) => Promise<boolean>;
  clearError: () => void;
}

export const CHAIN_PARAMS_BY_NETWORK: Record<MSTNetworkKey, {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}> = {
  testnet: {
    chainId: '0x5752035',
    chainName: 'MST Chain Testnet',
    nativeCurrency: {
      name: 'MSTC',
      symbol: 'MSTC',
      decimals: 18,
    },
    rpcUrls: ['https://testnetrpc.mstblockchain.com'],
    blockExplorerUrls: ['https://testnet.mstscan.com'],
  },
  mainnet: {
    chainId: '0x1226',
    chainName: 'MST Chain Mainnet',
    nativeCurrency: {
      name: 'MSTC',
      symbol: 'MSTC',
      decimals: 18,
    },
    rpcUrls: ['https://mariorpc.mstblockchain.com', 'https://4646.rpc.thirdweb.com'],
    blockExplorerUrls: ['https://mstscan.com'],
  },
};

// Legacy parameter for backward compatibility
export const MST_CHAIN_PARAMS = CHAIN_PARAMS_BY_NETWORK.testnet;

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// EIP-6963 Provider Announcement Types
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

/**
 * Resolves the active wallet provider, prioritizing BridgeKey if detected.
 */
function resolveWalletProvider(eip6963BridgeKeyProvider: any): { provider: any; isBridgeKey: boolean; name: string } {
  if (typeof window === 'undefined') {
    return { provider: null, isBridgeKey: false, name: 'No Provider' };
  }

  // 1. EIP-6963 announced BridgeKey provider
  if (eip6963BridgeKeyProvider) {
    return { provider: eip6963BridgeKeyProvider, isBridgeKey: true, name: 'BridgeKey Wallet' };
  }

  const win = window as any;

  // 2. window.bridgekey direct injection
  if (win.bridgekey) {
    const bkProvider = win.bridgekey.request ? win.bridgekey : (win.bridgekey.ethereum || win.bridgekey);
    return { provider: bkProvider, isBridgeKey: true, name: 'BridgeKey Wallet' };
  }

  // 3. window.ethereum with isBridgeKey flag or multi-provider list
  if (win.ethereum) {
    if (win.ethereum.isBridgeKey) {
      return { provider: win.ethereum, isBridgeKey: true, name: 'BridgeKey Wallet' };
    }

    if (Array.isArray(win.ethereum.providers)) {
      const bk = win.ethereum.providers.find((p: any) => p && p.isBridgeKey);
      if (bk) {
        return { provider: bk, isBridgeKey: true, name: 'BridgeKey Wallet' };
      }
    }

    // General EVM provider fallback
    const name = win.ethereum.isMetaMask ? 'MetaMask' : 'EVM Wallet';
    return { provider: win.ethereum, isBridgeKey: false, name };
  }

  return { provider: null, isBridgeKey: false, name: 'No Provider' };
}

const STORAGE_NETWORK_KEY = 'notaryvault_selected_network';

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<WalletConnectionStatus>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBridgeKeyDetected, setIsBridgeKeyDetected] = useState(false);
  const [eip6963Provider, setEip6963Provider] = useState<any>(null);
  const [contractAdminAddress, setContractAdminAddress] = useState<string | null>(null);

  // Network selection state: default to 'testnet' unless explicitly saved
  const [selectedNetwork, setSelectedNetworkState] = useState<MSTNetworkKey>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_NETWORK_KEY);
      if (saved === 'mainnet' || saved === 'testnet') {
        return saved;
      }
    } catch {
      // Storage access fallback
    }
    return 'testnet';
  });

  const setSelectedNetwork = (net: MSTNetworkKey) => {
    setSelectedNetworkState(net);
    try {
      localStorage.setItem(STORAGE_NETWORK_KEY, net);
    } catch {
      // Ignore storage errors
    }
  };

  const timeoutTimerRef = useRef<any>(null);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
    };
  }, []);

  // Provider discovery & Event listeners
  useEffect(() => {
    // 1. Listen for EIP-6963 Provider Announcements
    const onAnnounceProvider = (event: any) => {
      const detail: EIP6963ProviderDetail = event.detail;
      const isBk = detail?.info?.name?.toLowerCase().includes('bridgekey') || 
                   detail?.info?.rdns?.toLowerCase().includes('bridgekey');
      if (isBk && detail?.provider) {
        setIsBridgeKeyDetected(true);
        setEip6963Provider(detail.provider);
        setWalletName('BridgeKey Wallet');
      }
    };

    window.addEventListener('eip6963:announceProvider', onAnnounceProvider);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // 2. Initial resolution of available provider
    const resolved = resolveWalletProvider(null);
    if (resolved.isBridgeKey) {
      setIsBridgeKeyDetected(true);
      setWalletName('BridgeKey Wallet');
    } else if (resolved.provider) {
      setWalletName(resolved.name);
    }

    // 3. Silent check if an account was already authorized (does NOT prompt or block)
    const activeProv = resolved.provider;
    if (activeProv && typeof activeProv.request === 'function') {
      activeProv.request({ method: 'eth_accounts' })
        .then((accounts: string[]) => {
          if (accounts && accounts.length > 0 && accounts[0]) {
            setAddress(accounts[0]);
            setStatus('connected');
            activeProv.request({ method: 'eth_chainId' })
              .then((id: string) => setChainId(id))
              .catch(() => {});
          } else {
            // Keep clean disconnected state
            setAddress(null);
            setStatus('disconnected');
          }
        })
        .catch(() => {
          setStatus('disconnected');
        });

      // 4. Attach standard EIP-1193 event listeners
      const handleAccountsChanged = (accounts: string[]) => {
        if (!accounts || accounts.length === 0) {
          setAddress(null);
          setStatus('disconnected');
        } else {
          setAddress(accounts[0]);
          setStatus('connected');
          setError(null);
        }
      };

      const handleChainChanged = (newChainId: string) => {
        setChainId(newChainId);
      };

      const handleDisconnect = () => {
        setAddress(null);
        setChainId(null);
        setStatus('disconnected');
      };

      if (activeProv.on) {
        activeProv.on('accountsChanged', handleAccountsChanged);
        activeProv.on('chainChanged', handleChainChanged);
        activeProv.on('disconnect', handleDisconnect);
      }

      return () => {
        window.removeEventListener('eip6963:announceProvider', onAnnounceProvider);
        if (activeProv.removeListener) {
          activeProv.removeListener('accountsChanged', handleAccountsChanged);
          activeProv.removeListener('chainChanged', handleChainChanged);
          activeProv.removeListener('disconnect', handleDisconnect);
        }
      };
    }

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounceProvider);
    };
  }, []);

  // Determine current active provider
  const { provider: activeProvider, isBridgeKey: currentIsBk, name: currentName } = resolveWalletProvider(eip6963Provider);

  // Network detection from connected chainId
  const detectedNetworkKey: MSTNetworkKey | null = useMemo(() => {
    if (!chainId) return null;
    if (isChainIdMatchingNetwork(chainId, 'testnet')) return 'testnet';
    if (isChainIdMatchingNetwork(chainId, 'mainnet')) return 'mainnet';
    return null;
  }, [chainId]);

  const isMSTNetwork = Boolean(detectedNetworkKey !== null);
  const isCorrectNetwork = Boolean(detectedNetworkKey === selectedNetwork);
  const activeNetworkConfig = MST_NETWORKS[selectedNetwork];

  // On-chain verified Super Author (from established contract registry)
  const [onChainSuperAuthorAddress, setOnChainSuperAuthorAddress] = useState<string | null>(null);

  // Contract verification state across networks
  const [contractVerificationStatus, setContractVerificationStatus] = useState<
    'checking' | 'verified' | 'unverified' | 'rpc_error' | 'not_configured'
  >('checking');
  const [contractVerificationError, setContractVerificationError] = useState<string | null>(null);

  const contractAddress = useMemo(() => {
    return getContractAddressForNetwork(selectedNetwork);
  }, [selectedNetwork]);

  const verifyDeploymentStatus = async (net: MSTNetworkKey) => {
    setContractVerificationStatus('checking');
    setContractVerificationError(null);

    if (!isContractConfigured(net)) {
      setContractVerificationStatus('not_configured');
      setContractVerificationError(
        net === 'mainnet'
          ? 'No smart contract address configured for MST Chain Mainnet.'
          : 'No smart contract address configured.'
      );
      return;
    }

    try {
      const res = await verifyContractCapabilities(net);
      if (res.valid) {
        setContractVerificationStatus('verified');
        setContractVerificationError(null);
      } else if (res.error && (res.error.toLowerCase().includes('rpc') || res.error.toLowerCase().includes('timeout') || res.error.toLowerCase().includes('network') || res.error.toLowerCase().includes('connection') || res.error.toLowerCase().includes('failed'))) {
        setContractVerificationStatus('rpc_error');
        setContractVerificationError(`Deployment status could not be verified on ${MST_NETWORKS[net]?.name || net}: ${res.error}`);
      } else {
        setContractVerificationStatus('unverified');
        setContractVerificationError(res.error || 'Contract bytecode or interface verification failed.');
      }
    } catch (err: any) {
      setContractVerificationStatus('rpc_error');
      setContractVerificationError(`Deployment status could not be verified on ${MST_NETWORKS[net]?.name || net}: ${err?.message || 'RPC communication failure'}`);
    }
  };

  const fetchOnChainSuperAuthor = () => {
    getOnChainSuperAuthor(selectedNetwork)
      .then(adminAddr => {
        if (adminAddr) {
          setOnChainSuperAuthorAddress(adminAddr);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchOnChainSuperAuthor();
    verifyDeploymentStatus(selectedNetwork);
  }, [selectedNetwork]);

  // Fetch authorized admin address from smart contract for selectedNetwork
  useEffect(() => {
    let isMounted = true;
    getContractAdmin(selectedNetwork)
      .then(adminAddr => {
        if (isMounted && adminAddr) {
          setContractAdminAddress(adminAddr);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [selectedNetwork]);

  // Listen to in-app contract deployment events
  useEffect(() => {
    const handleDeployed = () => {
      getContractAdmin(selectedNetwork).then(addr => {
        if (addr) setContractAdminAddress(addr);
      });
      fetchOnChainSuperAuthor();
      verifyDeploymentStatus(selectedNetwork);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('notaryvault:mainnet-deployed', handleDeployed);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('notaryvault:mainnet-deployed', handleDeployed);
      }
    };
  }, [selectedNetwork]);

  const refreshContractConfig = () => {
    getContractAdmin(selectedNetwork).then(addr => {
      if (addr) setContractAdminAddress(addr);
    });
    fetchOnChainSuperAuthor();
    verifyDeploymentStatus(selectedNetwork);
  };

  // Verified on-chain Super Author matching connected wallet
  const isVerifiedOnChainSuperAuthor = useMemo(() => {
    if (!address) return false;
    const cleanAddr = address.trim().toLowerCase();
    if (onChainSuperAuthorAddress && cleanAddr === onChainSuperAuthorAddress.trim().toLowerCase()) {
      return true;
    }
    if (contractAdminAddress && cleanAddr === contractAdminAddress.trim().toLowerCase()) {
      return true;
    }
    return false;
  }, [address, onChainSuperAuthorAddress, contractAdminAddress]);

  const isSuperAuthor = isVerifiedOnChainSuperAuthor;

  // Strict check: can deploy Mainnet contract?
  const canDeployMainnetContract = useMemo(() => {
    // 1. Must be connected
    if (status !== 'connected' || !address) return false;
    // 2. Must be verified on-chain as Super Author
    if (!isVerifiedOnChainSuperAuthor) return false;
    // 3. Must be connected to MST Chain Mainnet (chainId === 4646 / 0x1226)
    if (!chainId || !isChainIdMatchingNetwork(chainId, 'mainnet')) return false;
    // 4. No valid contract already configured on Mainnet
    if (isContractConfigured('mainnet')) return false;
    // 5. If contract is verified, or RPC is unavailable, do NOT allow duplicate deployment
    if (contractVerificationStatus === 'verified' || contractVerificationStatus === 'rpc_error') return false;
    return true;
  }, [status, address, isVerifiedOnChainSuperAuthor, chainId, contractVerificationStatus]);

  // Track on-chain secondary author status
  const [isChainSecondaryAuthor, setIsChainSecondaryAuthor] = useState<boolean>(false);

  const refreshAuthorRoles = () => {
    if (address && !isSuperAuthor) {
      checkIsOnChainAuthor(address, selectedNetwork)
        .then(res => setIsChainSecondaryAuthor(res))
        .catch(() => {});
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (address && !isSuperAuthor) {
      checkIsOnChainAuthor(address, selectedNetwork)
        .then(res => {
          if (isMounted) setIsChainSecondaryAuthor(res);
        })
        .catch(() => {});
    } else {
      setIsChainSecondaryAuthor(false);
    }
    return () => { isMounted = false; };
  }, [address, isSuperAuthor, selectedNetwork]);

  const isSecondaryAuthor = useMemo(() => {
    if (!address || isSuperAuthor) return false;
    return Boolean(isChainSecondaryAuthor);
  }, [address, isSuperAuthor, isChainSecondaryAuthor]);

  const isAuthor = isSuperAuthor || isSecondaryAuthor;
  const isPublicUser = !isAuthor;

  const role: AuthorRole = isSuperAuthor
    ? 'super_author'
    : isSecondaryAuthor
    ? 'secondary_author'
    : 'public_user';

  const isAdminWallet = isSuperAuthor;
  const isRegistrar = isAuthor;

  /**
   * Cancel connection request and reset status from 'connecting' back to 'disconnected'
   */
  const cancelConnection = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    setStatus('disconnected');
    setError(null);
  };

  /**
   * Connects to BridgeKey / EVM wallet with timeout safety.
   * Invoked strictly on explicit user action (button click).
   */
  const connectWallet = async () => {
    setError(null);

    // If already connecting, allow cancelling or ignore
    if (status === 'connecting') {
      cancelConnection();
      return;
    }

    const { provider } = resolveWalletProvider(eip6963Provider);

    if (!provider || typeof provider.request !== 'function') {
      setStatus('error');
      setError('BridgeKey Wallet extension was not detected. Please install BridgeKey Wallet to connect to MST Chain.');
      return;
    }

    setStatus('connecting');

    try {
      // 20-second timeout recovery so UI is never stuck in 'connecting'
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimerRef.current = setTimeout(() => {
          reject(new Error('CONNECTION_TIMEOUT'));
        }, 20000);
      });

      const requestPromise = provider.request({
        method: 'eth_requestAccounts',
      });

      const accounts = await Promise.race([requestPromise, timeoutPromise]) as string[];

      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }

      if (!accounts || accounts.length === 0 || !accounts[0]) {
        setStatus('disconnected');
        setError('No account authorized by wallet.');
        return;
      }

      const connectedAccount = accounts[0];
      setAddress(connectedAccount);
      setStatus('connected');
      setError(null);

      try {
        const currentChain: string = await provider.request({ method: 'eth_chainId' });
        setChainId(currentChain);
      } catch {
        // chainId is optional
      }
    } catch (err: any) {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }

      if (err?.code === 4001 || err?.message?.includes('rejected') || err?.message?.includes('User rejected')) {
        // User closed or rejected request
        setStatus('disconnected');
        setError('Connection request was rejected in wallet.');
      } else if (err?.code === -32002) {
        // Already pending
        setStatus('error');
        setError('A connection request is already pending in BridgeKey. Please open the extension to approve it.');
      } else if (err?.message === 'CONNECTION_TIMEOUT') {
        setStatus('disconnected');
        setError('Connection request timed out. Please unlock your BridgeKey wallet and try again.');
      } else {
        setStatus('error');
        setError(err?.message || 'Failed to connect to wallet.');
      }
    }
  };

  /**
   * Disconnects current wallet session and resets state
   */
  const disconnectWallet = () => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    setAddress(null);
    setChainId(null);
    setStatus('disconnected');
    setError(null);
  };

  /**
   * Prompts user to switch wallet network to the target network (defaults to selectedNetwork).
   * Never silently switches or sends transactions to another chain.
   */
  const switchNetworkToMST = async (targetNet: MSTNetworkKey = selectedNetwork): Promise<boolean> => {
    if (!activeProvider) {
      setError('No wallet provider available.');
      return false;
    }
    setError(null);

    const targetParams = CHAIN_PARAMS_BY_NETWORK[targetNet];
    const targetName = targetParams.chainName;

    try {
      await activeProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetParams.chainId }],
      });
      return true;
    } catch (switchError: any) {
      // 4902: Chain not added yet
      if (switchError?.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        try {
          await activeProvider.request({
            method: 'wallet_addEthereumChain',
            params: [targetParams],
          });
          return true;
        } catch (addError: any) {
          setError(addError?.message || `Failed to add ${targetName} to wallet.`);
          return false;
        }
      } else if (switchError?.code === 4001) {
        setError(`Network switch to ${targetName} was rejected in wallet.`);
        return false;
      } else {
        setError(switchError?.message || `Failed to switch network to ${targetName}.`);
        return false;
      }
    }
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <WalletContext.Provider
      value={{
        status,
        address,
        chainId,
        isMSTNetwork,
        isCorrectNetwork,
        selectedNetwork,
        detectedNetworkKey,
        activeNetworkConfig,
        setSelectedNetwork,
        walletName: walletName || currentName || (currentIsBk || isBridgeKeyDetected ? 'BridgeKey Wallet' : 'EVM Wallet'),
        isBridgeKeyDetected: isBridgeKeyDetected || currentIsBk,
        isProviderAvailable: Boolean(activeProvider),
        provider: activeProvider,
        contractAdminAddress,
        contractAddress,
        contractVerificationStatus,
        contractVerificationError,
        isAdminWallet,
        isRegistrar,
        role,
        isSuperAuthor,
        isSecondaryAuthor,
        isAuthor,
        isPublicUser,
        onChainSuperAuthorAddress,
        isVerifiedOnChainSuperAuthor,
        canDeployMainnetContract,
        refreshAuthorRoles,
        refreshContractConfig,
        error,
        connectWallet,
        cancelConnection,
        disconnectWallet,
        switchNetworkToMST,
        clearError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
