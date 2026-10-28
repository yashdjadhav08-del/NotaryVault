import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatusPill } from '../components/ui/StatusPill';
import { useDocuments } from '../context/DocumentContext';
import { useWallet } from '../context/WalletContext';
import { getExplorerTxUrl } from '../services/contractService';
import type { VerificationCheckResult } from '../types';
import { 
  ShieldCheck, 
  FileSearch, 
  UploadCloud, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  Clock, 
  Trash2, 
  Copy, 
  Check, 
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { computeFileSHA256, truncateHash } from '../lib/hash';
import { formatFileSize } from '../lib/format';

export const VerifyDocumentPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { documents, verifyDocument, addToast } = useDocuments();
  const { selectedNetwork } = useWallet();

  const [activeTab, setActiveTab] = useState<'id' | 'file'>('id');
  const [documentIdInput, setDocumentIdInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [computedFileHash, setComputedFileHash] = useState<string>('');

  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationCheckResult | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check URL query param e.g. /app/verify?id=NV-2026-000101
  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl) {
      setDocumentIdInput(idFromUrl);
      setActiveTab('id');
      handleVerifyId(idFromUrl);
    }
  }, [searchParams]);

  const handleVerifyId = async (idToVerify?: string) => {
    const targetId = (idToVerify || documentIdInput).trim();
    if (!targetId) return;

    setIsVerifying(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 600)); // smooth UX feedback
      const res = await verifyDocument(targetId, undefined, selectedNetwork);
      setVerificationResult(res);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsVerifying(true);

    try {
      const hash = await computeFileSHA256(file);
      setComputedFileHash(hash);
      await new Promise(resolve => setTimeout(resolve, 600));

      const res = await verifyDocument(documentIdInput.trim() || undefined, file, selectedNetwork);
      setVerificationResult(res);
    } catch {
      addToast('Hashing Error', 'Failed to compute SHA-256 for file.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const clearForm = () => {
    setDocumentIdInput('');
    setSelectedFile(null);
    setComputedFileHash('');
    setVerificationResult(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
    addToast('Hash Copied', 'Hash copied to clipboard.');
  };

  return (
    <AppShell
      title="Verify Document"
      subtitle="Inspect cryptographic SHA-256 hashes against registered records to detect alterations or confirm baseline state."
    >
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Verification Mode Selector Tabs */}
        <div className="flex p-1 bg-stone-100 rounded-2xl max-w-md mx-auto border border-black/5">
          <button
            type="button"
            onClick={() => { setActiveTab('id'); setVerificationResult(null); }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'id' 
                ? 'bg-white text-[#1C1C1C] shadow-sm' 
                : 'text-stone-600 hover:text-black'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-[#1F6FF0]" />
            <span>By Document ID</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('file'); setVerificationResult(null); }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'file' 
                ? 'bg-white text-[#1C1C1C] shadow-sm' 
                : 'text-stone-600 hover:text-black'
            }`}
          >
            <UploadCloud className="w-4 h-4 text-[#FF2E88]" />
            <span>By File Hashing</span>
          </button>
        </div>

        {/* Input Card */}
        <Card className="p-6 md:p-8 space-y-6 bg-white">
          {activeTab === 'id' ? (
            /* Mode 1: Document ID Input */
            <form onSubmit={(e) => { e.preventDefault(); handleVerifyId(); }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Enter Document ID
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <Input
                    placeholder="e.g. NV-2026-000101"
                    value={documentIdInput}
                    onChange={(e) => setDocumentIdInput(e.target.value)}
                    className="font-mono text-base"
                  />
                  <Button
                    type="submit"
                    variant="primary-app"
                    size="md"
                    loading={isVerifying}
                    disabled={!documentIdInput.trim()}
                    className="w-full sm:w-auto shrink-0"
                    icon={<FileSearch className="w-4 h-4" />}
                  >
                    Verify Record
                  </Button>
                </div>
              </div>

              {/* Registered Documents Quick Fill if any exist */}
              {documents.length > 0 && (
                <div className="pt-3 border-t border-black/[0.04]">
                  <div className="text-xs font-semibold text-stone-500 mb-2">
                    Your registered documents:
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {documents.slice(0, 4).map(doc => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => { setDocumentIdInput(doc.id); handleVerifyId(doc.id); }}
                        className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 border border-black/10 hover:bg-stone-200 font-mono transition-colors cursor-pointer"
                      >
                        {doc.id} ({doc.name.slice(0, 18)})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          ) : (
            /* Mode 2: Local File Hashing & Verification */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Select File for Client SHA-256 Check
                </label>
                <p className="text-xs text-stone-500 mb-3">
                  Upload an original or modified document. The browser will hash it instantly and cross-reference catalog records.
                </p>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="p-4 rounded-2xl bg-stone-50 border border-black/10 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-[#1C1C1C]">{selectedFile.name}</div>
                      <div className="text-xs text-stone-500 font-mono mt-0.5">
                        {formatFileSize(selectedFile.size)} • Computed SHA-256: {truncateHash(computedFileHash, 8, 8)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Change File
                      </Button>
                      <button
                        type="button"
                        onClick={clearForm}
                        className="p-2 text-stone-400 hover:text-rose-600"
                        aria-label="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-black/15 hover:border-[#FF2E88] hover:bg-pink-50/20 rounded-3xl p-8 text-center cursor-pointer transition-all"
                  >
                    <UploadCloud className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                    <div className="text-sm font-bold text-[#1C1C1C]">
                      Click to choose document file to verify
                    </div>
                    <div className="text-xs text-stone-400 mt-1">
                      Computed in memory with WebCrypto API • Never uploaded
                    </div>
                  </div>
                )}
              </div>

              {/* Optional reference Document ID if comparing against a specific record */}
              <div className="pt-2">
                <Input
                  label="Optional: Target Document ID (to compare specifically against)"
                  placeholder="e.g. NV-2026-000101 (Leave empty to search all records)"
                  value={documentIdInput}
                  onChange={(e) => setDocumentIdInput(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}
        </Card>

        {/* Verification Result Card */}
        {verificationResult && (
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
            {verificationResult.state === 'verified' && (
              /* State 1: VERIFIED */
              <Card className="p-6 md:p-8 bg-emerald-50/40 border border-emerald-300 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-7 h-7 stroke-[2]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-emerald-950">
                        {verificationResult.message}
                      </h3>
                      <StatusPill status="Verified" />
                    </div>
                    <p className="text-sm text-emerald-800 mt-1 leading-relaxed">
                      {verificationResult.details}
                    </p>
                  </div>
                </div>

                {verificationResult.document && (
                  <div className="p-4 bg-white rounded-2xl border border-emerald-200 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-stone-400 block font-medium">Document Name</span>
                        <span className="font-bold text-stone-900">{verificationResult.document.name}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block font-medium">Document ID</span>
                        <span className="font-mono font-bold text-stone-900">{verificationResult.document.id}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block font-medium">Registered Owner</span>
                        <span className="font-bold text-stone-900">{verificationResult.document.owner}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-black/[0.04]">
                      <div className="flex items-center justify-between text-stone-500 mb-1">
                        <span className="font-semibold">Matching SHA-256 Digest</span>
                        <button
                          onClick={() => copyToClipboard(verificationResult.storedHash || '')}
                          className="text-[#1F6FF0] hover:underline flex items-center gap-1 font-mono cursor-pointer"
                        >
                          {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedHash ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="font-mono text-[11px] text-stone-800 break-all bg-stone-50 p-2.5 rounded-xl border border-black/5 select-all">
                        {verificationResult.storedHash}
                      </div>
                    </div>

                    {verificationResult.onChainVerified && (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span>
                              Confirmed On {verificationResult.networkKey === 'mainnet' ? 'MST Chain Mainnet' : 'MST Chain Testnet'}
                            </span>
                          </span>
                          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                            Smart Contract Verified
                          </span>
                        </div>
                        {verificationResult.onChainRegistrant && (
                          <div className="text-[11px] text-stone-600">
                            Registrant Wallet: <span className="font-mono text-stone-800 font-medium">{verificationResult.onChainRegistrant}</span>
                          </div>
                        )}
                        {(verificationResult.document?.txHash || verificationResult.txHash) && (
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-emerald-200/50">
                            <span className="text-stone-500 font-mono truncate mr-2">
                              Tx: {verificationResult.document?.txHash || verificationResult.txHash}
                            </span>
                            <a
                              href={getExplorerTxUrl(verificationResult.document?.txHash || verificationResult.txHash || '', verificationResult.networkKey || selectedNetwork)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 hover:underline shrink-0 font-bold inline-flex items-center gap-1"
                            >
                              <span>MSTScan</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-emerald-800 pt-2 border-t border-emerald-200/60">
                  <span>Cryptographic hash verification result</span>
                  {verificationResult.document && (
                    <Button
                      variant="primary-app"
                      size="sm"
                      onClick={() => navigate(`/app/documents/${verificationResult.document?.id}`)}
                      icon={<ArrowRight className="w-4 h-4" />}
                    >
                      View Full Details
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {verificationResult.state === 'mismatch' && (
              /* State 2: HASH MISMATCH */
              <Card className="p-6 md:p-8 bg-rose-50/50 border border-rose-300 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-7 h-7 stroke-[2]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-rose-950">
                        {verificationResult.message}
                      </h3>
                      <StatusPill status="Hash Mismatch" />
                    </div>
                    <p className="text-sm text-rose-800 mt-1 leading-relaxed">
                      {verificationResult.details}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-rose-200 space-y-3 text-xs">
                  <div className="text-xs text-rose-900 font-semibold mb-2">
                    Cryptographic Comparison Diagnostic:
                  </div>

                  {verificationResult.submittedHash && (
                    <div>
                      <span className="text-stone-400 block font-medium">Submitted / Inspected Hash:</span>
                      <span className="font-mono text-[11px] text-rose-700 break-all bg-rose-50/70 p-2 rounded-lg block mt-0.5 border border-rose-100">
                        {verificationResult.submittedHash}
                      </span>
                    </div>
                  )}

                  {verificationResult.storedHash && (
                    <div>
                      <span className="text-stone-400 block font-medium">Registered Catalog Baseline Hash:</span>
                      <span className="font-mono text-[11px] text-stone-700 break-all bg-stone-50 p-2 rounded-lg block mt-0.5 border border-stone-200">
                        {verificationResult.storedHash}
                      </span>
                    </div>
                  )}

                  <div className="p-3 bg-rose-100/50 rounded-xl text-rose-900 text-[11px] leading-relaxed mt-2">
                    <strong>Notice:</strong> Even a 1-byte alteration (such as modified text, altered boundary dimensions, or an added digital stamp) generates an entirely disparate SHA-256 fingerprint. The file inspected does not represent the registered baseline version.
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-rose-800 pt-2 border-t border-rose-200">
                  <span>Cryptographic mismatch flagged</span>
                  {verificationResult.document && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/app/documents/${verificationResult.document?.id}`)}
                    >
                      Inspect Baseline Record
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {verificationResult.state === 'pending' && (
              /* State 3: PENDING REVIEW */
              <Card className="p-6 md:p-8 bg-amber-50/50 border border-amber-300 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Clock className="w-7 h-7 stroke-[2]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-amber-950">
                        {verificationResult.message}
                      </h3>
                      <StatusPill status="Pending" />
                    </div>
                    <p className="text-sm text-amber-800 mt-1 leading-relaxed">
                      {verificationResult.details}
                    </p>
                  </div>
                </div>

                {verificationResult.document && (
                  <div className="p-4 bg-white rounded-2xl border border-amber-200 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-stone-400 block font-medium">Document ID</span>
                        <span className="font-mono font-bold text-stone-900">{verificationResult.document.id}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block font-medium">Document Name</span>
                        <span className="font-bold text-stone-900">{verificationResult.document.name}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-amber-800 pt-2 border-t border-amber-200">
                  <span>Status: Document registered but awaiting secondary review.</span>
                  {verificationResult.document && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/app/documents/${verificationResult.document?.id}`)}
                    >
                      View Details
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {verificationResult.state === 'not_found' && (
              /* State 4: DOCUMENT NOT FOUND */
              <Card className="p-6 md:p-8 bg-stone-100 border border-stone-300 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-stone-200 text-stone-600 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-7 h-7 stroke-[2]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-stone-900">
                        {verificationResult.message}
                      </h3>
                      <StatusPill status="Not Found" />
                    </div>
                    <p className="text-sm text-stone-600 mt-1 leading-relaxed">
                      {verificationResult.details}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-stone-200 text-xs text-stone-600 leading-relaxed">
                  No corresponding document ID or cryptographic hash exists in this repository. Check the ID spelling or register the document first.
                </div>

                <div className="flex items-center justify-between text-xs text-stone-500 pt-2 border-t border-stone-200">
                  <span>Registry query result</span>
                  <Button
                    variant="primary-app"
                    size="sm"
                    onClick={() => navigate('/app/register')}
                  >
                    Register as New Document
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

      </div>
    </AppShell>
  );
};
