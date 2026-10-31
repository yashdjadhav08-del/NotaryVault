import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusPill } from '../components/ui/StatusPill';
import { useDocuments } from '../context/DocumentContext';
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  Share2, 
  ShieldCheck, 
  PlusCircle, 
  ArrowRight,
  RefreshCw,
  AlertCircle,
  UserCheck,
  ExternalLink
} from 'lucide-react';
import { formatRelativeTime } from '../lib/format';
import { useWallet } from '../context/WalletContext';
import { getExplorerTxUrl } from '../services/contractService';
import { DeployMainnetModal } from '../components/contract/DeployMainnetModal';
import type { DocumentRecord, ActivityEvent, SharedRecord } from '../types';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { documents, sharedRecords, activities, isSyncing, syncError, syncWithBlockchain } = useDocuments();
  const { 
    selectedNetwork, 
    activeNetworkConfig, 
    isAuthor, 
    canDeployMainnetContract,
    contractVerificationStatus,
    contractVerificationError,
    refreshContractConfig
  } = useWallet();
  const [deployModalOpen, setDeployModalOpen] = useState(false);

  const totalDocs = documents.length;
  const verifiedDocs = documents.filter((d: DocumentRecord) => d.status === 'Verified').length;
  const pendingDocs = documents.filter((d: DocumentRecord) => d.status === 'Pending').length;
  const activeShares = sharedRecords.filter((s: SharedRecord) => s.status === 'Active').length;

  const recentDocs = documents.slice(0, 5);
  const recentActivities = activities.slice(0, 6);

  return (
    <AppShell
      title="Dashboard"
      subtitle="Overview of registered property deeds, verification statuses, and active access links."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : 'text-stone-500'}`} />}
            onClick={() => syncWithBlockchain(selectedNetwork, true)}
            title="Sync and restore records from MST Chain"
          >
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync On-Chain'}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="hidden xl:inline-flex"
            icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
            onClick={() => navigate('/app/verify')}
          >
            Verify Document
          </Button>
          {isAuthor ? (
            <Button
              variant="primary-app"
              size="sm"
              className="hidden lg:inline-flex"
              icon={<PlusCircle className="w-4 h-4" />}
              onClick={() => navigate('/app/register')}
            >
              Register Document
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="hidden lg:inline-flex"
              icon={<UserCheck className="w-4 h-4 text-blue-600" />}
              onClick={() => navigate('/app/apply-author')}
            >
              Become Author
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-8">
        
        {/* Mainnet unconfigured notice */}
        {selectedNetwork === 'mainnet' && contractVerificationStatus === 'not_configured' && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-start justify-between gap-3.5 text-xs text-amber-900">
            <div className="flex items-start gap-3.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>MST Chain Mainnet: Smart Contract Not Deployed/Configured</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                    Mainnet
                  </span>
                </div>
                <p className="text-stone-600 leading-relaxed max-w-2xl">
                  Smart contract address for MST Chain Mainnet (Chain ID: 4646 / 0x1226) is currently unconfigured. All Mainnet transactions, on-chain registrations, and contract calls are paused until a verified contract is deployed. Testnet remains fully functional.
                </p>
              </div>
            </div>
            {canDeployMainnetContract && (
              <Button
                variant="primary-app"
                size="sm"
                onClick={() => setDeployModalOpen(true)}
                icon={<ShieldCheck className="w-4 h-4" />}
                className="shrink-0 self-start sm:self-center"
              >
                Deploy Mainnet Contract
              </Button>
            )}
          </div>
        )}

        {/* RPC connection failure notice (Requirement 8) */}
        {selectedNetwork === 'mainnet' && contractVerificationStatus === 'rpc_error' && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-start justify-between gap-3.5 text-xs text-rose-950">
            <div className="flex items-start gap-3.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>MST Chain Mainnet: Deployment Status Could Not Be Verified</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                    RPC Warning
                  </span>
                </div>
                <p className="text-stone-700 leading-relaxed max-w-2xl">
                  {contractVerificationError || 'Mainnet RPC endpoint could not be reached. Contract deployment verification is paused. Local records remain preserved.'}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refreshContractConfig()}
              icon={<RefreshCw className="w-4 h-4" />}
              className="shrink-0 self-start sm:self-center"
            >
              Retry Check
            </Button>
          </div>
        )}

        {/* Sync Error Banner if applicable */}
        {syncError && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900 gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                On-chain sync warning for {activeNetworkConfig.name}: {syncError}. Local records are preserved.
              </span>
            </div>
            <button
              onClick={() => syncWithBlockchain(selectedNetwork, true)}
              className="text-xs font-semibold text-amber-800 underline hover:text-amber-950 shrink-0 cursor-pointer"
            >
              Retry Sync
            </button>
          </div>
        )}

        {/* Stat Cards Grid (Derived from embedded mini-UI design tokens) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          {/* 1. Total Documents */}
          <Card className="p-5 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Total Documents
              </span>
              <div className="text-3xl font-extrabold text-[#1C1C1C] mt-1.5">
                {totalDocs}
              </div>
              <div className="text-xs text-stone-500 mt-1 flex items-center gap-1 font-medium">
                <span className="text-blue-600">All registered</span> • Client catalog
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1F6FF0] flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
          </Card>

          {/* 2. Verified Records */}
          <Card className="p-5 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Verified Records
              </span>
              <div className="text-3xl font-extrabold text-[#1C1C1C] mt-1.5">
                {verifiedDocs}
              </div>
              <div className="text-xs text-stone-500 mt-1 flex items-center gap-1 font-medium">
                <span className="text-emerald-600">Integrity confirmed</span> • SHA-256
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </Card>

          {/* 3. Pending Verification */}
          <Card className="p-5 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Pending Verification
              </span>
              <div className="text-3xl font-extrabold text-[#1C1C1C] mt-1.5">
                {pendingDocs}
              </div>
              <div className="text-xs text-stone-500 mt-1 flex items-center gap-1 font-medium">
                <span className="text-amber-600">Awaiting review</span> • Queue
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
          </Card>

          {/* 4. Active Shared Links (Authors only) or Public Registry info */}
          {isAuthor ? (
            <Card className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  Active Shared Links
                </span>
                <div className="text-3xl font-extrabold text-[#1C1C1C] mt-1.5">
                  {activeShares}
                </div>
                <div className="text-xs text-stone-500 mt-1 flex items-center gap-1 font-medium">
                  <span className="text-purple-600">{activeShares} active</span> • Access links
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Share2 className="w-6 h-6" />
              </div>
            </Card>
          ) : (
            <Card className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  Public Verification
                </span>
                <div className="text-3xl font-extrabold text-[#1C1C1C] mt-1.5">
                  {verifiedDocs}
                </div>
                <div className="text-xs text-stone-500 mt-1 flex items-center gap-1 font-medium">
                  <span className="text-emerald-600">On-Chain Verified</span> • SHA-256
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </Card>
          )}

        </div>

        {/* Quick Actions Card (Screenshot 4 Reference) */}
        <Card className="p-6 bg-gradient-to-r from-white via-white to-stone-50">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-[#1C1C1C]">Quick Actions</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Perform common document registry operations and cryptographic verification checks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isAuthor && (
                <Button
                  variant="primary-app"
                  size="md"
                  icon={<PlusCircle className="w-4 h-4" />}
                  onClick={() => navigate('/app/register')}
                >
                  Register New Document
                </Button>
              )}
              {!isAuthor && (
                <Button
                  variant="primary-app"
                  size="md"
                  icon={<UserCheck className="w-4 h-4" />}
                  onClick={() => navigate('/app/apply-author')}
                >
                  Apply for Author Status
                </Button>
              )}
              <Button
                variant="secondary"
                size="md"
                icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
                onClick={() => navigate('/app/verify')}
              >
                Verify Document ID / File
              </Button>
              <Button
                variant="secondary"
                size="md"
                icon={<FileText className="w-4 h-4" />}
                onClick={() => navigate('/app/documents')}
              >
                View Document Library
              </Button>
            </div>
          </div>
        </Card>

        {/* Two Column Layout: Recent Documents & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Recent Documents (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1C]">Recent Documents</h3>
                <p className="text-xs text-stone-500">Latest legal deeds and lease agreements</p>
              </div>
              <Link 
                to="/app/documents" 
                className="text-xs font-semibold text-[#1F6FF0] hover:underline flex items-center gap-1"
              >
                <span>View all ({totalDocs})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentDocs.length === 0 ? (
              <Card className="p-8 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mb-3">
                  <FileText className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h4 className="text-sm font-bold text-[#1C1C1C]">No documents available</h4>
                <p className="text-xs text-stone-500 mt-1 max-w-sm">
                  {isAuthor
                    ? "You haven't registered any documents yet. Register a document to compute its cryptographic hash and track verification."
                    : "No public documents have been registered yet. You can verify existing documents or apply to become an authorized author."}
                </p>
                {isAuthor ? (
                  <Button
                    variant="primary-app"
                    size="sm"
                    className="mt-4"
                    icon={<PlusCircle className="w-4 h-4" />}
                    onClick={() => navigate('/app/register')}
                  >
                    Register First Document
                  </Button>
                ) : (
                  <Button
                    variant="primary-app"
                    size="sm"
                    className="mt-4"
                    icon={<UserCheck className="w-4 h-4" />}
                    onClick={() => navigate('/app/apply-author')}
                  >
                    Apply to Become an Author
                  </Button>
                )}
              </Card>
            ) : (
              <Card className="divide-y divide-black/[0.06] overflow-hidden">
                {recentDocs.map((doc: DocumentRecord) => (
                  <div
                    key={doc.id}
                    onClick={() => navigate(`/app/documents/${doc.id}`)}
                    className="p-4 flex items-center justify-between hover:bg-stone-50/80 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 stroke-[1.75]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#1C1C1C] truncate">
                            {doc.name}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                            (doc.networkKey || selectedNetwork) === 'mainnet'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {(doc.networkKey || selectedNetwork) === 'mainnet' ? 'MAINNET' : 'TESTNET'}
                          </span>
                        </div>
                        <div className="text-xs text-stone-500 mt-0.5 truncate">
                          {doc.owner} • <span className="font-mono text-stone-600">{doc.id}</span> • {doc.type}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-3">
                      <StatusPill status={doc.status} size="sm" />
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* Right Column: Recent Activity History (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1C]">Recent Activity</h3>
                <p className="text-xs text-stone-500">Audit trail timeline entries</p>
              </div>
              <Link 
                to="/app/activity" 
                className="text-xs font-semibold text-[#1F6FF0] hover:underline flex items-center gap-1"
              >
                <span>View history</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentActivities.length === 0 ? (
              <Card className="p-8 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mb-3">
                  <Clock className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h4 className="text-sm font-bold text-[#1C1C1C]">No activity available</h4>
                <p className="text-xs text-stone-500 mt-1 max-w-xs">
                  Audit timeline records will appear here as documents are registered, verified, or shared.
                </p>
              </Card>
            ) : (
              <Card className="p-4 space-y-4">
                <div className="space-y-3.5">
                  {recentActivities.map((act: ActivityEvent) => (
                    <div key={act.id} className="flex items-start gap-3 text-xs pb-3 border-b border-black/[0.04] last:border-none last:pb-0">
                      <div className="w-2 h-2 rounded-full bg-[#1F6FF0] mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#1C1C1C] truncate">{act.title}</span>
                          <span className="text-[11px] text-stone-400 shrink-0 font-mono">
                            {formatRelativeTime(act.timestamp)}
                          </span>
                        </div>
                        <p className="text-stone-500 text-[11px] mt-0.5 leading-relaxed">
                          {act.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                            (act.networkKey || selectedNetwork) === 'mainnet'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {(act.networkKey || selectedNetwork) === 'mainnet' ? 'MAINNET' : 'TESTNET'}
                          </span>
                          {act.isOnChain && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              On-Chain
                            </span>
                          )}
                          {act.documentId && (
                            <Link 
                              to={`/app/documents/${act.documentId}`} 
                              className="text-[11px] text-[#1F6FF0] font-mono hover:underline"
                            >
                              {act.documentId}
                            </Link>
                          )}
                          {act.txHash && (
                            <a
                              href={getExplorerTxUrl(act.txHash, act.networkKey || selectedNetwork)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-mono text-stone-500 hover:text-blue-600 hover:underline inline-flex items-center gap-0.5 ml-auto"
                            >
                              <span>{act.txHash.slice(0, 8)}...</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

        </div>

      </div>

      {/* Mainnet Contract Deployment Modal */}
      <DeployMainnetModal
        isOpen={deployModalOpen}
        onClose={() => setDeployModalOpen(false)}
      />
    </AppShell>
  );
};
