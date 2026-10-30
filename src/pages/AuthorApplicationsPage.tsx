import React, { useState, useMemo, useEffect } from 'react';
import { ethers } from 'ethers';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Textarea } from '../components/ui/Input';
import { useWallet } from '../context/WalletContext';
import { useAuthors } from '../context/AuthorContext';
import { 
  checkIsOnChainAuthor, 
  checkIsOnChainSuperAuthor, 
  getExplorerTxUrl 
} from '../services/contractService';
import { formatDate } from '../lib/format';
import { truncateHash } from '../lib/hash';
import type { AuthorApplication, ApplicationStatus } from '../types';
import { 
  UserCheck, 
  Check, 
  X, 
  AlertTriangle, 
  ExternalLink,
  Search,
  Copy,
  Info,
  ShieldCheck,
  ClipboardList,
  FileCheck2,
  Eye
} from 'lucide-react';

interface ReviewChecklistState {
  licenseChecked: boolean;
  issuingAuthorityChecked: boolean;
  organizationChecked: boolean;
  supportingInfoReviewed: boolean;
  decisionNotes: string;
}

export const AuthorApplicationsPage: React.FC = () => {
  const { 
    isSuperAuthor, 
    contractAdminAddress, 
    provider, 
    selectedNetwork 
  } = useWallet();
  const { 
    applications, 
    reviewApplication 
  } = useAuthors();

  // List filter state
  const [filterStatus, setFilterStatus] = useState<ApplicationStatus | 'All'>('Pending');
  const [isProcessing, setIsProcessing] = useState(false);

  // Feature 2: Super Author Search State
  const [searchWalletInput, setSearchWalletInput] = useState('');
  const [searchValidationError, setSearchValidationError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchRpcError, setSearchRpcError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{
    searchedAddress: string;
    application: AuthorApplication | null;
    isOnChainAuthor: boolean;
    isSuperAuthor: boolean;
  } | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Feature 3: Credential Review Modal & Checklist State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewingApp, setReviewingApp] = useState<AuthorApplication | null>(null);
  const [checklist, setChecklist] = useState<ReviewChecklistState>({
    licenseChecked: false,
    issuingAuthorityChecked: false,
    organizationChecked: false,
    supportingInfoReviewed: false,
    decisionNotes: '',
  });
  const [checklistSavedNotice, setChecklistSavedNotice] = useState(false);

  // Reject Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectApp, setRejectApp] = useState<AuthorApplication | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Memoized filter for performance with large lists
  const filteredApps = useMemo(() => {
    return applications.filter(app => {
      if (filterStatus === 'All') return true;
      return app.status === filterStatus;
    });
  }, [applications, filterStatus]);

  // Load checklist from localStorage when reviewing an application
  useEffect(() => {
    if (reviewingApp) {
      try {
        const stored = localStorage.getItem(`NV_AUTHOR_REVIEW_${reviewingApp.id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setChecklist(parsed);
        } else {
          setChecklist({
            licenseChecked: reviewingApp.status === 'Approved',
            issuingAuthorityChecked: reviewingApp.status === 'Approved',
            organizationChecked: reviewingApp.status === 'Approved',
            supportingInfoReviewed: reviewingApp.status === 'Approved',
            decisionNotes: reviewingApp.reviewNotes || '',
          });
        }
      } catch {
        // Fallback default
      }
    }
  }, [reviewingApp]);

  // Save checklist notes to browser local storage
  const handleSaveChecklist = () => {
    if (!reviewingApp) return;
    try {
      localStorage.setItem(`NV_AUTHOR_REVIEW_${reviewingApp.id}`, JSON.stringify(checklist));
      setChecklistSavedNotice(true);
      setTimeout(() => setChecklistSavedNotice(false), 2500);
    } catch {
      // Ignore quota errors
    }
  };

  // Feature 2: Execute search by wallet address
  const handleSearchWallet = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = searchWalletInput.trim();
    if (!raw) {
      setSearchValidationError('Please enter a wallet address.');
      setSearchResult(null);
      setSearchRpcError(null);
      return;
    }

    if (!ethers.isAddress(raw)) {
      setSearchValidationError('Please enter a valid Ethereum-compatible wallet address (0x followed by 40 hexadecimal characters).');
      setSearchResult(null);
      setSearchRpcError(null);
      return;
    }

    setSearchValidationError('');
    setSearchRpcError(null);
    setIsSearching(true);

    const normalized = raw.toLowerCase();

    try {
      // 1. Search existing applications in local catalog
      const matchingApp = applications.find(a => a.applicantWallet.toLowerCase() === normalized) || null;

      // 2. Query actual on-chain author status via RPC
      let onChainAuthor = false;
      let onChainSuper = false;
      try {
        onChainAuthor = await checkIsOnChainAuthor(normalized, selectedNetwork);
        onChainSuper = await checkIsOnChainSuperAuthor(normalized, selectedNetwork);
      } catch (rpcErr: any) {
        setSearchRpcError(`RPC query failed: ${rpcErr?.message || 'Could not connect to MST Chain node.'}`);
      }

      setSearchResult({
        searchedAddress: raw,
        application: matchingApp,
        isOnChainAuthor: onChainAuthor || onChainSuper,
        isSuperAuthor: onChainSuper,
      });
    } catch (err: any) {
      setSearchRpcError(`Error searching wallet: ${err?.message || 'Unknown search error'}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchWalletInput('');
    setSearchValidationError('');
    setSearchRpcError(null);
    setSearchResult(null);
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  // Approval flow (restricted to Super Author)
  const handleApprove = async (app: AuthorApplication) => {
    if (!isSuperAuthor) return;
    setIsProcessing(true);
    try {
      const notes = checklist.decisionNotes.trim() || 'Approved by Super Author after credential audit';
      await reviewApplication(app.id, 'Approved', notes, provider);
      // Persist completed checklist
      localStorage.setItem(`NV_AUTHOR_REVIEW_${app.id}`, JSON.stringify({
        ...checklist,
        licenseChecked: true,
        issuingAuthorityChecked: true,
        organizationChecked: true,
        supportingInfoReviewed: true,
        decisionNotes: notes,
      }));
      setReviewModalOpen(false);
      setReviewingApp(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Rejection confirmation flow
  const handleRejectConfirm = async () => {
    if (!isSuperAuthor || !rejectApp) return;
    setIsProcessing(true);
    try {
      await reviewApplication(rejectApp.id, 'Rejected', rejectNotes, provider);
      localStorage.setItem(`NV_AUTHOR_REVIEW_${rejectApp.id}`, JSON.stringify({
        ...checklist,
        decisionNotes: rejectNotes,
      }));
      setRejectModalOpen(false);
      setRejectApp(null);
      setRejectNotes('');
      if (reviewModalOpen) {
        setReviewModalOpen(false);
        setReviewingApp(null);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const openReviewModal = (app: AuthorApplication) => {
    setReviewingApp(app);
    setReviewModalOpen(true);
  };

  return (
    <AppShell
      title="Author Applications"
      subtitle="Super Author administration portal for reviewing, auditing credentials, and authorizing Secondary Authors."
    >
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Unauthorized Access Warning */}
        {!isSuperAuthor && (
          <Card className="p-6 bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-bold text-amber-950 text-sm">
                  Super Author Access Only
                </h3>
                <p>
                  This portal and privileged authorization actions are restricted strictly to the designated Super Author authority (
                  <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200">
                    {contractAdminAddress ? `${contractAdminAddress.slice(0, 6)}...${contractAdminAddress.slice(-4)}` : '0x6D96...00C4'}
                  </code>).
                </p>
                <p className="text-[11px] text-amber-800">
                  Secondary Authors and Public Users do not have permission to view, review, or authorize author applications.
                </p>
              </div>
            </div>
          </Card>
        )}

        {isSuperAuthor && (
          <>
            {/* FEATURE 2: Prominent Search by Wallet Address */}
            <Card className="p-6 space-y-4 bg-white border border-black/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#1C1C1C] flex items-center gap-2">
                    <Search className="w-4 h-4 text-[#1F6FF0]" />
                    <span>Search applicant by wallet address</span>
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Search registered applicant records or inspect on-chain authorization status for any wallet address.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-stone-400 bg-stone-50 px-2 py-1 rounded-lg border border-black/5">
                  Ethereum-compatible format
                </span>
              </div>

              <form onSubmit={handleSearchWallet} className="space-y-2">
                <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Enter 0x... wallet address to lookup application status"
                      value={searchWalletInput}
                      onChange={(e) => {
                        setSearchWalletInput(e.target.value);
                        if (searchValidationError) setSearchValidationError('');
                      }}
                      className="font-mono text-xs w-full h-11"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="submit"
                      variant="primary-app"
                      size="md"
                      loading={isSearching}
                      disabled={!searchWalletInput.trim()}
                      icon={<Search className="w-4 h-4" />}
                    >
                      Search
                    </Button>
                    {(searchResult || searchWalletInput) && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={handleClearSearch}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                {searchValidationError && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{searchValidationError}</span>
                  </p>
                )}
              </form>

              {/* RPC Failure Notice (Distinct from No Results) */}
              {searchRpcError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">RPC Query Notice:</span> {searchRpcError}
                    <p className="text-[11px] text-red-700 mt-0.5">
                      Could not complete on-chain lookup. This is a network failure, not an empty search result.
                    </p>
                  </div>
                </div>
              )}

              {/* Search Result Display */}
              {searchResult && (
                <div className="pt-3 border-t border-black/[0.06] animate-in fade-in duration-200">
                  {searchResult.application ? (
                    /* Found in Applications Catalog */
                    <div className="p-4 bg-stone-50 rounded-2xl border border-black/10 space-y-3 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900 text-sm">
                            {searchResult.application.applicantName}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full font-mono ${
                            searchResult.application.status === 'Approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : searchResult.application.status === 'Rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {searchResult.application.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary-app"
                            size="sm"
                            onClick={() => openReviewModal(searchResult.application!)}
                            icon={<Eye className="w-3.5 h-3.5" />}
                          >
                            Open Review Details
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <span className="text-stone-400 font-medium block">Organization:</span>
                          <span className="font-semibold text-stone-800">{searchResult.application.organization}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 font-medium block">License Reference:</span>
                          <span className="font-mono font-semibold text-stone-800">{searchResult.application.licenseNumber}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 font-medium block">Submitted:</span>
                          <span className="text-stone-700">{formatDate(searchResult.application.submittedAt)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2 font-mono text-[11px] text-stone-600 truncate">
                          <span className="text-stone-400">Wallet:</span>
                          <span className="truncate">{searchResult.application.applicantWallet}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyAddress(searchResult.application!.applicantWallet)}
                          className="text-[#1F6FF0] hover:underline flex items-center gap-1 text-[11px] font-medium shrink-0 cursor-pointer"
                        >
                          {copiedAddress ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedAddress ? 'Copied' : 'Copy Address'}</span>
                        </button>
                      </div>
                    </div>
                  ) : searchResult.isOnChainAuthor ? (
                    /* On-chain Author but no local application */
                    <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2 text-xs text-blue-950">
                      <div className="flex items-center justify-between">
                        <span className="font-bold flex items-center gap-1.5 text-sm">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          <span>On-Chain Authorized {searchResult.isSuperAuthor ? 'Super Author' : 'Secondary Author'}</span>
                        </span>
                        <span className="text-[10px] font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                          Active On-Chain
                        </span>
                      </div>
                      <p className="leading-relaxed text-[11px] text-blue-900">
                        This wallet address is an authorized {searchResult.isSuperAuthor ? 'Super Author (Administrator)' : 'Secondary Author'} on <strong>MST Chain {selectedNetwork}</strong>, but has no local application catalog record in this browser (may have been authorized directly or from another session).
                      </p>
                      <div className="flex items-center justify-between pt-1 font-mono text-[11px]">
                        <span className="text-blue-700 truncate mr-2">{searchResult.searchedAddress}</span>
                        <button
                          type="button"
                          onClick={() => copyAddress(searchResult.searchedAddress)}
                          className="text-blue-800 hover:underline flex items-center gap-1 text-[11px] font-medium shrink-0 cursor-pointer"
                        >
                          {copiedAddress ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedAddress ? 'Copied' : 'Copy Address'}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* No Results */
                    <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 text-xs text-stone-600 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-stone-800 block">No Application Found</span>
                        <span>No application or authorized author record matches wallet <code className="font-mono text-stone-800">{truncateHash(searchResult.searchedAddress, 10, 8)}</code>.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyAddress(searchResult.searchedAddress)}
                        className="text-[#1F6FF0] hover:underline flex items-center gap-1 text-[11px] font-medium shrink-0 cursor-pointer"
                      >
                        {copiedAddress ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>Copy</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Filter Tabs & Application Counter */}
            <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-black/[0.06]">
              <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl border border-black/5 text-xs font-semibold">
                {(['Pending', 'Approved', 'Rejected', 'All'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setFilterStatus(tab)}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                      filterStatus === tab
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-500 hover:text-stone-900'
                    }`}
                  >
                    {tab}
                    {tab === 'Pending' && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-mono text-[10px]">
                        {applications.filter(a => a.status === 'Pending').length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <span className="text-xs text-stone-400 font-medium">
                {filteredApps.length} application(s) listed
              </span>
            </div>

            {/* Applications List */}
            {filteredApps.length === 0 ? (
              <Card className="p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-stone-800">
                  No {filterStatus !== 'All' ? filterStatus : ''} Applications
                </h3>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  There are currently no author applications matching the selected status filter.
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredApps.map(app => (
                  <Card key={app.id} className="p-6 space-y-4 hover:border-black/20 transition-all">
                    
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/[0.06]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1F6FF0] flex items-center justify-center shrink-0">
                          <UserCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-bold text-[#1C1C1C]">
                              {app.applicantName}
                            </h4>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full font-mono ${
                              app.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : app.status === 'Rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {app.status}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-stone-400">
                            {app.id} • Submitted {formatDate(app.submittedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openReviewModal(app)}
                          icon={<ClipboardList className="w-3.5 h-3.5" />}
                        >
                          Review Credentials
                        </Button>

                        {app.status === 'Pending' && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isProcessing}
                              onClick={() => {
                                setRejectApp(app);
                                setRejectModalOpen(true);
                              }}
                              className="text-red-700 hover:bg-red-50"
                            >
                              <X className="w-3.5 h-3.5 mr-1" />
                              Reject
                            </Button>
                            <Button
                              variant="primary-app"
                              size="sm"
                              disabled={isProcessing}
                              onClick={() => handleApprove(app)}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" />
                              Approve & Authorize
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 bg-stone-50 rounded-xl">
                        <span className="text-stone-400 font-medium block mb-0.5">Organization</span>
                        <span className="font-bold text-stone-900">{app.organization}</span>
                      </div>
                      <div className="p-3 bg-stone-50 rounded-xl">
                        <span className="text-stone-400 font-medium block mb-0.5">License / Bar ID</span>
                        <span className="font-mono font-bold text-stone-900">{app.licenseNumber}</span>
                      </div>
                      <div className="p-3 bg-stone-50 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-stone-400 font-medium block mb-0.5">Applicant Wallet</span>
                          <span className="font-mono font-bold text-stone-900 break-all">
                            {truncateHash(app.applicantWallet, 8, 8)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyAddress(app.applicantWallet)}
                          className="text-[#1F6FF0] hover:underline text-[11px] font-medium cursor-pointer"
                          title="Copy full address"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Justification Box */}
                    <div className="p-3.5 bg-stone-50/80 rounded-xl text-xs text-stone-700 space-y-1">
                      <span className="font-bold text-stone-500 block text-[11px] uppercase tracking-wider">
                        Jurisdictional Justification
                      </span>
                      <p className="leading-relaxed">{app.justification}</p>
                    </div>

                    {/* Approval or Rejection Meta */}
                    {app.status === 'Approved' && (
                      <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-emerald-800">
                        <span className="flex items-center gap-1 font-semibold">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Approved by Super Author on {formatDate(app.reviewedAt || app.submittedAt)}
                        </span>
                        {app.approvalTxHash && (
                          <a
                            href={getExplorerTxUrl(app.approvalTxHash, selectedNetwork)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[11px] text-[#1F6FF0] hover:underline inline-flex items-center gap-1"
                          >
                            <span>Tx: {app.approvalTxHash.slice(0, 10)}...</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}

                    {app.status === 'Rejected' && app.reviewNotes && (
                      <div className="pt-2 text-xs text-red-800 space-y-0.5">
                        <span className="font-bold">Rejection Note:</span>
                        <p className="text-stone-700">{app.reviewNotes}</p>
                      </div>
                    )}

                  </Card>
                ))}
              </div>
            )}
          </>
        )}

      </div>

      {/* FEATURE 3: Genuine Author Credential Review Modal with Checklist */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false);
          setReviewingApp(null);
        }}
        title="Author Credential Review & Audit"
        subtitle={reviewingApp ? `Systematic review for ${reviewingApp.applicantName} (${reviewingApp.id})` : ''}
      >
        {reviewingApp && (
          <div className="space-y-4 text-xs">
            
            {/* Applicant Details Table */}
            <div className="p-3.5 bg-stone-50 rounded-2xl border border-black/5 space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-black/5">
                <span className="text-stone-500 font-medium">Applicant Name:</span>
                <span className="font-bold text-stone-900">{reviewingApp.applicantName}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-black/5">
                <span className="text-stone-500 font-medium">Organization / Notary Office:</span>
                <span className="font-semibold text-stone-900">{reviewingApp.organization}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-black/5">
                <span className="text-stone-500 font-medium">Professional License / Commission:</span>
                <span className="font-mono font-bold text-stone-900">{reviewingApp.licenseNumber}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-black/5">
                <span className="text-stone-500 font-medium">Application Status:</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full font-mono ${
                  reviewingApp.status === 'Approved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : reviewingApp.status === 'Rejected'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {reviewingApp.status}
                </span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-black/5">
                <span className="text-stone-500 font-medium">Submitted At:</span>
                <span className="text-stone-800">{formatDate(reviewingApp.submittedAt)}</span>
              </div>
              {reviewingApp.reviewedAt && (
                <div className="flex items-center justify-between pb-1.5 border-b border-black/5">
                  <span className="text-stone-500 font-medium">Reviewed At:</span>
                  <span className="text-stone-800">{formatDate(reviewingApp.reviewedAt)}</span>
                </div>
              )}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-stone-500">
                  <span className="font-medium">Applicant Wallet Address:</span>
                  <button
                    type="button"
                    onClick={() => copyAddress(reviewingApp.applicantWallet)}
                    className="text-[#1F6FF0] hover:underline flex items-center gap-1 font-mono text-[11px] cursor-pointer"
                  >
                    {copiedAddress ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="font-mono text-[11px] text-stone-800 bg-white p-2 rounded-lg border border-black/5 break-all select-all">
                  {reviewingApp.applicantWallet}
                </div>
              </div>
            </div>

            {/* Jurisdictional Justification */}
            <div className="p-3 bg-stone-50 rounded-xl border border-black/5 space-y-1">
              <span className="font-bold text-stone-500 block uppercase tracking-wider text-[10px]">
                Jurisdictional Scope & Justification
              </span>
              <p className="text-stone-800 leading-relaxed">{reviewingApp.justification}</p>
            </div>

            {/* Systematic Review Checklist for Super Author */}
            <div className="p-4 bg-blue-50/50 border border-blue-200/80 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-blue-950 flex items-center gap-1.5 text-xs">
                  <FileCheck2 className="w-4 h-4 text-blue-600" />
                  <span>Super Author Credential Audit Checklist</span>
                </div>
                {checklistSavedNotice && (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full animate-in fade-in">
                    Notes Saved Locally
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checklist.licenseChecked}
                    onChange={(e) => setChecklist(prev => ({ ...prev, licenseChecked: e.target.checked }))}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-stone-800 leading-tight">
                    Professional license or commission reference checked independently against jurisdictional registry.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checklist.issuingAuthorityChecked}
                    onChange={(e) => setChecklist(prev => ({ ...prev, issuingAuthorityChecked: e.target.checked }))}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-stone-800 leading-tight">
                    Issuing authority or official state/national records verified as active and in good standing.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checklist.organizationChecked}
                    onChange={(e) => setChecklist(prev => ({ ...prev, organizationChecked: e.target.checked }))}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-stone-800 leading-tight">
                    Organization / notary office entity details confirmed.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checklist.supportingInfoReviewed}
                    onChange={(e) => setChecklist(prev => ({ ...prev, supportingInfoReviewed: e.target.checked }))}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-stone-800 leading-tight">
                    Supporting information, scope of practice, and contact records reviewed.
                  </span>
                </label>
              </div>

              <div className="pt-2">
                <Textarea
                  label="Super Author Audit Decision Notes & Concerns"
                  placeholder="Record verification notes, registry inquiry dates, or outstanding concerns..."
                  value={checklist.decisionNotes}
                  onChange={(e) => setChecklist(prev => ({ ...prev, decisionNotes: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveChecklist}
                >
                  Save Checklist Notes Locally
                </Button>
              </div>
            </div>

            {/* Privacy & Legal Notices */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5 text-[11px] text-amber-950">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <Info className="w-3.5 h-3.5 text-amber-600" />
                <span>Security & Credential Disclaimers</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-stone-600">
                <li>
                  <strong>Local Storage:</strong> Checklist audit notes are stored locally in this browser. They are not uploaded to the blockchain or shared across browsers.
                </li>
                <li>
                  <strong>Public On-Chain Records:</strong> Blockchain authorization transactions are permanent and public. Never submit sensitive personal identifiers to contract calls.
                </li>
                <li>
                  <strong>Independent Responsibility:</strong> No automated identity verification or official registry lookup is performed by the smart contract. The Super Author is responsible for genuine independent credential verification.
                </li>
              </ul>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setReviewModalOpen(false);
                  setReviewingApp(null);
                }}
              >
                Close
              </Button>

              {reviewingApp.status === 'Pending' && isSuperAuthor && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => {
                      setRejectApp(reviewingApp);
                      setRejectModalOpen(true);
                    }}
                    className="text-red-700 hover:bg-red-50"
                  >
                    Reject Application
                  </Button>
                  <Button
                    type="button"
                    variant="primary-app"
                    size="sm"
                    loading={isProcessing}
                    disabled={
                      !checklist.licenseChecked || 
                      !checklist.issuingAuthorityChecked || 
                      !checklist.organizationChecked || 
                      !checklist.supportingInfoReviewed
                    }
                    onClick={() => handleApprove(reviewingApp)}
                    icon={<ShieldCheck className="w-3.5 h-3.5" />}
                  >
                    Approve & Authorize On-Chain
                  </Button>
                </>
              )}
            </div>

          </div>
        )}
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => {
          setRejectModalOpen(false);
          setRejectApp(null);
        }}
        title="Reject Author Application"
        subtitle={`Specify the justification for rejecting application ${rejectApp?.id}.`}
      >
        <div className="space-y-4 text-xs">
          <Textarea
            label="Rejection Notes & Justification *"
            placeholder="e.g. Incomplete bar license verification, jurisdictional mismatch, or invalid official office credentials..."
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            rows={4}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setRejectModalOpen(false);
                setRejectApp(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary-app"
              size="md"
              disabled={!rejectNotes.trim()}
              loading={isProcessing}
              onClick={handleRejectConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

    </AppShell>
  );
};
