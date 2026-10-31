import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { WalletButton } from '../components/ui/WalletButton';
import { useDocuments } from '../context/DocumentContext';
import { useWallet } from '../context/WalletContext';
import { 
  User, 
  ShieldCheck, 
  Wallet, 
  Trash2, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { 
  isContractConfigured, 
  getDeploymentConfig, 
  getExplorerAddressUrl,
  getExplorerTxUrl
} from '../services/contractService';
import { DeployMainnetModal } from '../components/contract/DeployMainnetModal';

export const SettingsPage: React.FC = () => {
  const { resetAllDemoData, addToast } = useDocuments();
  const { 
    status, 
    address, 
    chainId, 
    error, 
    walletName, 
    isBridgeKeyDetected, 
    cancelConnection,
    selectedNetwork,
    isSuperAuthor,
    contractAdminAddress,
    canDeployMainnetContract
  } = useWallet();

  const [activeTab, setActiveTab] = useState<'profile' | 'wallet' | 'security' | 'reset'>('profile');
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetActionError, setResetActionError] = useState<string | null>(null);
  const [deployModalOpen, setDeployModalOpen] = useState(false);

  // If a non-Super Author is on 'reset' tab (e.g. from state or wallet switch), redirect to 'profile'
  useEffect(() => {
    if (!isSuperAuthor && activeTab === 'reset') {
      setActiveTab('profile');
    }
  }, [isSuperAuthor, activeTab]);

  // Profile Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    addToast('Profile Saved', 'User profile preferences updated locally.');
  };

  const handleConfirmReset = async () => {
    setResetActionError(null);
    if (!isSuperAuthor) {
      const errMsg = 'Super Author access required: Only the root Super Author can clear stored data.';
      setResetActionError(errMsg);
      addToast('Access Denied', errMsg, 'error');
      setResetModalOpen(false);
      return;
    }

    try {
      await resetAllDemoData();
      setResetModalOpen(false);
    } catch (err: any) {
      const errMsg = err?.message || 'Super Author access required: Only the root Super Author can clear stored data.';
      setResetActionError(errMsg);
      addToast('Access Denied', errMsg, 'error');
      setResetModalOpen(false);
    }
  };

  return (
    <AppShell
      title="Settings"
      subtitle="Manage profile preferences, notifications, security parameters, BridgeKey wallet, and local storage."
    >
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-black/[0.08] overflow-x-auto gap-2 text-sm font-medium">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-4 border-b-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'profile'
                ? 'border-[#1F6FF0] text-[#1F6FF0]'
                : 'border-transparent text-stone-500 hover:text-black'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profile</span>
          </button>

          <button
            onClick={() => setActiveTab('wallet')}
            className={`py-3 px-4 border-b-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'wallet'
                ? 'border-[#1F6FF0] text-[#1F6FF0]'
                : 'border-transparent text-stone-500 hover:text-black'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>BridgeKey Wallet (MST Chain)</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`py-3 px-4 border-b-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'security'
                ? 'border-[#1F6FF0] text-[#1F6FF0]'
                : 'border-transparent text-stone-500 hover:text-black'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Security & Cryptography</span>
          </button>

          {isSuperAuthor && (
            <button
              onClick={() => setActiveTab('reset')}
              className={`py-3 px-4 border-b-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'reset'
                  ? 'border-rose-500 text-rose-600'
                  : 'border-transparent text-stone-500 hover:text-rose-600'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Stored Data</span>
            </button>
          )}
        </div>

        {/* =========================================================================
            TAB 1: USER PROFILE
            ========================================================================= */}
        {activeTab === 'profile' && (
          <Card className="p-6 md:p-8 space-y-6 bg-white">
            <div>
              <h3 className="text-lg font-bold text-[#1C1C1C]">User Profile</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Session attributes displayed on exported verification receipts and audit logs.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <Input
                label="Full Name"
                placeholder="e.g. Aarav Mehta"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Input
                label="Registrar Email"
                placeholder="e.g. registrar@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="Organization / Law Firm"
                placeholder="e.g. Apex Legal Services"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />

              <div className="pt-2">
                <Button type="submit" variant="primary-app" size="sm">
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        )}


        {/* =========================================================================
            TAB 3: SECURITY & CRYPTOGRAPHY
            ========================================================================= */}
        {activeTab === 'security' && (
          <Card className="p-6 md:p-8 space-y-6 bg-white">
            <div>
              <h3 className="text-lg font-bold text-[#1C1C1C]">Cryptographic Standards</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Technical parameters used for browser WebCrypto hashing and integrity calculations.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 space-y-1">
                <div className="font-bold text-stone-900 text-sm">Hashing Algorithm: SHA-256 (FIPS 180-4)</div>
                <div className="text-stone-500 leading-relaxed">
                  Deterministic 256-bit hash executed client-side via <code className="bg-white px-1.5 py-0.5 rounded border border-black/10 font-mono text-stone-800">window.crypto.subtle.digest</code>. Zero plain-text document bytes are ever uploaded.
                </div>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 space-y-1">
                <div className="font-bold text-stone-900 text-sm">Document ID Format</div>
                <div className="text-stone-500 leading-relaxed font-mono">
                  NV-[YEAR]-[6 DIGIT SEQUENCE] (e.g. NV-2026-000101)
                </div>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 space-y-1">
                <div className="font-bold text-stone-900 text-sm">Integrity Collision Resistance</div>
                <div className="text-stone-500 leading-relaxed">
                  2^128 security against collision attacks. Changing even a single pixel in an attached agreement alters the resultant digest completely.
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* =========================================================================
            TAB 4: BRIDGEKEY WALLET STATUS (MST CHAIN)
            ========================================================================= */}
        {activeTab === 'wallet' && (
          <Card className="p-6 md:p-8 space-y-6 bg-white">
            <div>
              <h3 className="text-lg font-bold text-[#1C1C1C]">BridgeKey Wallet & MST Chain Integration</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Status of Web3 wallet connectivity for MST Chain blockchain operations.
              </p>
            </div>

            {/* Live Connection Status Card */}
            <div className="p-5 rounded-2xl bg-stone-50 border border-black/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-600'
                  }`}>
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <span>{status === 'connected' ? 'Wallet Connected' : status === 'connecting' ? 'Connecting to Wallet...' : 'Wallet Disconnected'}</span>
                      {isBridgeKeyDetected && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                          BridgeKey
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500">
                      {status === 'connected'
                        ? `Connected via ${walletName || 'Web3 Provider'}`
                        : 'Connect BridgeKey Wallet or any EIP-1193 compatible provider'}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <span className={`text-[11px] font-mono font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                    status === 'connected'
                      ? 'bg-emerald-100 text-emerald-800'
                      : status === 'connecting'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-stone-200 text-stone-600'
                  }`}>
                    {status}
                  </span>
                  {status === 'connecting' && (
                    <button
                      type="button"
                      onClick={cancelConnection}
                      className="px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:text-stone-900 bg-white border border-stone-300 rounded-lg shadow-xs hover:bg-stone-50 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <WalletButton />
                </div>
              </div>

              {/* Connected Address Details */}
              {status === 'connected' && address && (
                <div className="pt-3 border-t border-black/5 space-y-2 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-black/5">
                      <span className="text-stone-400 block font-medium">Connected Address</span>
                      <span className="font-mono text-stone-900 break-all font-semibold select-all">
                        {address}
                      </span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-black/5">
                      <span className="text-stone-400 block font-medium">Chain ID</span>
                      <span className="font-mono text-stone-900 font-semibold">
                        {chainId || 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {status === 'error' && error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Dual Network Specifications (Testnet & Mainnet) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Supported MST Blockchain Networks
                </span>
                <span className="text-[11px] text-stone-500 font-mono">
                  Active in UI: <strong>{selectedNetwork === 'mainnet' ? 'MST Chain Mainnet' : 'MST Chain Testnet'}</strong>
                </span>
              </div>

              {/* MST Chain Testnet Parameters */}
              <div className="p-5 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-3 text-xs text-blue-950">
                <div className="flex items-center justify-between font-bold">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    <span>MST Chain Testnet Specifications</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold border border-blue-200">
                    Chain ID: 91562037 (0x5752035)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2 bg-white/70 rounded-lg">
                    <span className="text-stone-500 block text-[10px] uppercase font-sans">Network Name</span>
                    MST Chain Testnet
                  </div>
                  <div className="p-2 bg-white/70 rounded-lg">
                    <span className="text-stone-500 block text-[10px] uppercase font-sans">Currency Symbol</span>
                    MSTC (18 decimals)
                  </div>
                  <div className="p-2 bg-white/70 rounded-lg sm:col-span-2">
                    <span className="text-stone-500 block text-[10px] uppercase font-sans">RPC Endpoint</span>
                    https://testnetrpc.mstblockchain.com
                  </div>
                  <div className="p-2 bg-white/70 rounded-lg sm:col-span-2 flex items-center justify-between">
                    <div>
                      <span className="text-stone-500 block text-[10px] uppercase font-sans">Block Explorer</span>
                      <span className="text-blue-900 font-mono">https://testnet.mstscan.com</span>
                    </div>
                    <a
                      href="https://testnet.mstscan.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 text-[11px] font-sans font-semibold shrink-0 ml-2"
                    >
                      <span>Open MSTScan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  {isContractConfigured('testnet') ? (
                    <div className="p-2 bg-white/70 rounded-lg sm:col-span-2 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <span className="text-stone-500 block text-[10px] uppercase font-sans">Deployed Contract Address</span>
                        <span className="text-blue-900 font-mono break-all text-[11px]">
                          {getDeploymentConfig('testnet').contractAddress}
                        </span>
                      </div>
                      <a
                        href={getExplorerAddressUrl(getDeploymentConfig('testnet').contractAddress, 'testnet')}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1 text-[11px] font-sans font-semibold shrink-0"
                      >
                        <span>Contract</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ) : (
                    <div className="p-2 bg-white/70 rounded-lg sm:col-span-2 text-stone-500">
                      Smart contract not deployed to Testnet yet. Deploy with <code className="font-mono text-stone-700">npm run deploy:mst:testnet</code>
                    </div>
                  )}
                </div>
              </div>

              {/* MST Chain Mainnet Parameters */}
              <div className="p-5 rounded-2xl bg-purple-50/60 border border-purple-200/80 space-y-3 text-xs text-purple-950">
                <div className="flex items-center justify-between font-bold">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-600" />
                    <span>MST Chain Mainnet Specifications</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold border border-purple-200">
                    Chain ID: 4646 (0x1226)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2 bg-white/70 rounded-lg">
                    <span className="text-stone-500 block text-[10px] uppercase font-sans">Network Name</span>
                    MST Chain Mainnet
                  </div>
                  <div className="p-2 bg-white/70 rounded-lg">
                    <span className="text-stone-500 block text-[10px] uppercase font-sans">Native Currency</span>
                    MSTC (18 decimals)
                  </div>
                  <div className="p-2 bg-white/70 rounded-lg sm:col-span-2">
                    <span className="text-stone-500 block text-[10px] uppercase font-sans">RPC Endpoint</span>
                    https://4646.rpc.thirdweb.com
                  </div>
                  <div className="p-2 bg-white/70 rounded-lg sm:col-span-2 flex items-center justify-between">
                    <div>
                      <span className="text-stone-500 block text-[10px] uppercase font-sans">Block Explorer</span>
                      <span className="text-purple-900 font-mono">https://mstscan.com</span>
                    </div>
                    <a
                      href="https://mstscan.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-600 hover:underline flex items-center gap-1 text-[11px] font-sans font-semibold shrink-0 ml-2"
                    >
                      <span>Open MSTScan Mainnet</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  {isContractConfigured('mainnet') ? (
                    <>
                      <div className="p-2 bg-white/70 rounded-lg sm:col-span-2 flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <span className="text-stone-500 block text-[10px] uppercase font-sans">Deployed Contract Address</span>
                          <span className="text-purple-900 font-mono break-all text-[11px]">
                            {getDeploymentConfig('mainnet').contractAddress}
                          </span>
                        </div>
                        <a
                          href={getExplorerAddressUrl(getDeploymentConfig('mainnet').contractAddress, 'mainnet')}
                          target="_blank"
                          rel="noreferrer"
                          className="text-purple-600 hover:underline flex items-center gap-1 text-[11px] font-sans font-semibold shrink-0"
                        >
                          <span>Contract</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      {getDeploymentConfig('mainnet').deploymentTxHash && (
                        <div className="p-2 bg-white/70 rounded-lg sm:col-span-2 flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <span className="text-stone-500 block text-[10px] uppercase font-sans">Deployment Transaction Hash</span>
                            <span className="text-stone-700 font-mono break-all text-[11px]">
                              {getDeploymentConfig('mainnet').deploymentTxHash}
                            </span>
                          </div>
                          <a
                            href={getExplorerTxUrl(getDeploymentConfig('mainnet').deploymentTxHash, 'mainnet')}
                            target="_blank"
                            rel="noreferrer"
                            className="text-purple-600 hover:underline flex items-center gap-1 text-[11px] font-sans font-semibold shrink-0"
                          >
                            <span>MSTScan</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </>
                  ) : canDeployMainnetContract ? (
                    <div className="p-3.5 bg-gradient-to-r from-purple-50 via-white to-purple-50/50 border border-purple-200 rounded-xl sm:col-span-2 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="font-bold text-xs text-purple-950 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
                            Super Author Mainnet Deployment Authorization
                          </span>
                          <p className="text-[11px] text-stone-600">
                            Connected wallet is verified on-chain as the Super Author on MST Chain Mainnet.
                          </p>
                        </div>
                        <Button
                          variant="primary-app"
                          size="sm"
                          onClick={() => setDeployModalOpen(true)}
                          icon={<ShieldCheck className="w-4 h-4" />}
                          className="shrink-0"
                        >
                          Deploy Mainnet Contract
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-white/70 rounded-lg sm:col-span-2 text-stone-600 flex items-center justify-between">
                      <span>Contract not deployed to MST Chain Mainnet yet.</span>
                      <span className="font-mono text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded border border-black/5">
                        Requires Super Author on Chain 4646
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 text-[11px] text-stone-500 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>
                  BridgeKey Wallet communicates via standard EIP-1193 / EIP-6963 provider interfaces. Private keys and recovery phrases are never handled or stored by the client application.
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* =========================================================================
            TAB 5: CLEAR STORED DATA (Strictly Super Author Only)
            ========================================================================= */}
        {activeTab === 'reset' && (
          isSuperAuthor ? (
            <Card className="p-6 md:p-8 space-y-6 bg-white border border-rose-200">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-rose-950">Clear Stored Documents & Audit Data</h3>
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full font-mono text-[10px] font-bold">
                    Super Author Only
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Administrative action for the designated Super Author to purge local browser storage caches on this device.
                </p>
              </div>

              {resetActionError && (
                <div className="p-3 bg-red-50 text-red-800 rounded-xl border border-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{resetActionError}</span>
                </div>
              )}

              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-rose-700" />
                  <span>Blockchain Immutability & Persistence Guarantee</span>
                </div>
                <p className="leading-relaxed text-[11px]">
                  This action clears browser-local storage, cached drafts, and local activity timeline records on this machine.
                  <strong> All on-chain registrations, smart contract author permissions, and blockchain audit logs on the MST Chain remain permanent, tamper-proof, and immutable.</strong>
                </p>
              </div>

              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => {
                  setResetActionError(null);
                  setResetModalOpen(true);
                }}
              >
                Clear All Stored Data
              </Button>
            </Card>
          ) : (
            <Card className="p-6 md:p-8 space-y-4 bg-rose-50 border border-rose-200 text-rose-950">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <h3 className="text-base font-bold text-rose-950">Super Author Access Required</h3>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">
                Clearing stored application and repository data is strictly restricted to the root Super Author ({contractAdminAddress ? `${contractAdminAddress.slice(0, 6)}...${contractAdminAddress.slice(-4)}` : '0x6D96...00C4'}).
                Secondary Authors and Public Users do not possess administrative permissions for this operation.
              </p>
            </Card>
          )
        )}

      </div>

      {/* Clear Stored Data Confirmation Modal */}
      {isSuperAuthor && (
        <Modal
          isOpen={resetModalOpen}
          onClose={() => setResetModalOpen(false)}
          title="Confirm Clear Stored Data"
          subtitle="Super Author confirmation required."
        >
          <div className="space-y-4">
            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to clear all stored document records, verification histories, and sharing entries from local storage?
              Blockchain records on MST Chain will remain unaffected. This local action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setResetModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmReset}
              >
                Confirm Clear
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Mainnet Contract Deployment Modal */}
      <DeployMainnetModal
        isOpen={deployModalOpen}
        onClose={() => setDeployModalOpen(false)}
      />

    </AppShell>
  );
};
