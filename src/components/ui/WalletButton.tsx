import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '../../context/WalletContext';
import { Button } from './Button';
import { Wallet, Check, Copy, LogOut, ChevronDown, AlertCircle, X, Loader2, ArrowRightLeft } from 'lucide-react';

export const WalletButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { 
    status, 
    address, 
    chainId, 
    isCorrectNetwork,
    selectedNetwork,
    detectedNetworkKey,
    activeNetworkConfig,
    setSelectedNetwork,
    walletName, 
    isBridgeKeyDetected, 
    connectWallet, 
    cancelConnection,
    disconnectWallet, 
    switchNetworkToMST, 
    error,
    clearError
  } = useWallet();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    try {
      await switchNetworkToMST(selectedNetwork);
    } finally {
      setIsSwitching(false);
    }
  };

  if (status === 'connected' && address) {
    const isMainnet = selectedNetwork === 'mainnet';

    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-xs transition-all cursor-pointer ${
            isCorrectNetwork 
              ? isMainnet
                ? 'border-purple-300 bg-purple-50/70 hover:bg-purple-100/70 text-purple-950'
                : 'border-blue-200 bg-blue-50/70 hover:bg-blue-100/70 text-blue-950'
              : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${
            isCorrectNetwork 
              ? isMainnet ? 'bg-purple-600 animate-pulse' : 'bg-blue-600 animate-pulse'
              : 'bg-amber-500 animate-bounce'
          }`} />
          <span className="font-mono">{truncateAddress(address)}</span>
          {!isCorrectNetwork && (
            <span className="text-[10px] text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded font-mono font-bold">
              Wrong Chain
            </span>
          )}
          {isCorrectNetwork && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
              isMainnet ? 'bg-purple-200/70 text-purple-900' : 'bg-blue-200/70 text-blue-900'
            }`}>
              {isMainnet ? 'Mainnet' : 'Testnet'}
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-black/10 rounded-2xl shadow-xl p-3.5 z-50 text-xs space-y-3 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between pb-2 border-b border-black/5">
              <span className="font-bold text-stone-900">{walletName || 'Connected Wallet'}</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                isCorrectNetwork 
                  ? isMainnet
                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {detectedNetworkKey === 'mainnet' 
                  ? 'MST Mainnet' 
                  : detectedNetworkKey === 'testnet' 
                  ? 'MST Testnet' 
                  : (chainId ? `Chain: ${chainId}` : 'Unknown Chain')}
              </span>
            </div>

            {/* Network Mismatch Warning & Explicit Switch Button */}
            {!isCorrectNetwork && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-start gap-1.5 text-amber-800 font-medium text-[11px] leading-snug">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Wallet is on {detectedNetworkKey ? (detectedNetworkKey === 'mainnet' ? 'MST Mainnet' : 'MST Testnet') : `Chain ${chainId}`}, but App has <strong>{activeNetworkConfig.name}</strong> selected.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSwitchNetwork}
                  disabled={isSwitching}
                  className="w-full py-1.5 px-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>{isSwitching ? 'Switching...' : `Switch Wallet to ${activeNetworkConfig.name}`}</span>
                </button>
              </div>
            )}

            {/* Target Network Switcher within dropdown */}
            <div className="p-2 bg-stone-50 rounded-xl border border-black/5 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
                Target App Network
              </span>
              <div className="grid grid-cols-2 gap-1 font-semibold">
                <button
                  type="button"
                  onClick={() => setSelectedNetwork('testnet')}
                  className={`py-1 px-2 rounded-lg text-center transition-all cursor-pointer ${
                    selectedNetwork === 'testnet'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white hover:bg-stone-100 text-stone-700 border border-black/5'
                  }`}
                >
                  MST Testnet
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedNetwork('mainnet')}
                  className={`py-1 px-2 rounded-lg text-center transition-all cursor-pointer ${
                    selectedNetwork === 'mainnet'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white hover:bg-stone-100 text-stone-700 border border-black/5'
                  }`}
                >
                  MST Mainnet
                </button>
              </div>
            </div>

            <div className="p-2 bg-stone-50 rounded-xl font-mono text-[11px] text-stone-700 break-all border border-black/5">
              <span className="text-[10px] text-stone-400 block font-sans uppercase mb-0.5">Account Address</span>
              {address}
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={copyAddress}
                className="flex-1 py-1.5 px-2.5 rounded-lg border border-black/10 hover:bg-stone-50 flex items-center justify-center gap-1.5 text-stone-700 font-medium cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  disconnectWallet();
                  setDropdownOpen(false);
                }}
                className="py-1.5 px-2.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center gap-1.5 font-medium cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Connecting State: Interactive button with clear Cancel action so user is NEVER stuck!
  if (status === 'connecting') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={cancelConnection}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 shadow-sm transition-all cursor-pointer"
          title="Connection request is in progress. Click to cancel."
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
          <span>Connecting...</span>
          <span className="text-[10px] text-amber-700 bg-amber-200/70 hover:bg-amber-300 px-1.5 py-0.5 rounded font-mono font-medium">
            Cancel
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="secondary"
        size="sm"
        icon={<Wallet className="w-3.5 h-3.5 text-stone-600" />}
        onClick={connectWallet}
        className="text-xs"
      >
        {isBridgeKeyDetected ? 'Connect BridgeKey' : 'Connect Wallet'}
      </Button>

      {error && (
        <div className="absolute right-0 top-full mt-2 w-72 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 shadow-xl z-50 flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-snug">{error}</div>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-rose-500 hover:text-rose-800 p-0.5 rounded cursor-pointer shrink-0"
            title="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
