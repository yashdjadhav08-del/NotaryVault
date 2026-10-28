import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { OptionRow } from '../components/ui/OptionRow';
import { StatusPill } from '../components/ui/StatusPill';
import { Modal } from '../components/ui/Modal';
import { useDocuments } from '../context/DocumentContext';
import { useWallet } from '../context/WalletContext';
import { 
  isContractConfigured, 
  getExplorerTxUrl, 
  getExplorerAddressUrl 
} from '../services/contractService';
import type { DocumentType, DocumentRecord } from '../types';
import { 
  UploadCloud, 
  FileCheck2, 
  Trash2, 
  Copy, 
  Check, 
  ShieldCheck, 
  Info,
  ExternalLink,
  AlertTriangle,
  ArrowRightLeft,
  Flame
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatFileSize } from '../lib/format';

export const RegisterDocumentPage: React.FC = () => {
  const navigate = useNavigate();
  const { registerDocument, addToast } = useDocuments();
  const { 
    status: walletStatus, 
    provider, 
    selectedNetwork, 
    activeNetworkConfig, 
    isCorrectNetwork, 
    switchNetworkToMST 
  } = useWallet();

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<DocumentType>('Property Deed');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Status & Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredResult, setRegisteredResult] = useState<DocumentRecord | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Mainnet Confirmation Dialog State
  const [mainnetConfirmOpen, setMainnetConfirmOpen] = useState(false);
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentTypes: DocumentType[] = [
    'Property Deed',
    'Sale Agreement',
    'Rental Agreement',
    'Affidavit',
    'Power of Attorney',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setErrors(prev => {
        const next = { ...prev };
        delete next.file;
        return next;
      });
    }
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Document title is required';
    if (!owner.trim()) errs.owner = 'Issuing party / registrant name is required';
    if (!issueDate) errs.issueDate = 'Issue date is required';
    if (!file) errs.file = 'A digital document file is required for SHA-256 fingerprint generation';
    
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const executeRegistration = async () => {
    if (!file) return;
    setIsSubmitting(true);

    try {
      // Cryptographic hashing delay for UX feedback
      await new Promise(resolve => setTimeout(resolve, 600));

      const newDoc = await registerDocument({
        name: name.trim(),
        type,
        description: description.trim(),
        owner: owner.trim(),
        issueDate,
        expiryDate: expiryDate ? expiryDate : undefined,
        file,
        rawProvider: walletStatus === 'connected' ? provider : undefined,
        networkKey: selectedNetwork,
      });

      setRegisteredResult(newDoc);
    } catch {
      addToast('Registration Failed', 'Could not complete client registration.', 'error');
    } finally {
      setIsSubmitting(false);
      setMainnetConfirmOpen(false);
      setMainnetAcknowledged(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !file) return;

    // Strong confirmation before Mainnet transactions if wallet will anchor on-chain
    if (selectedNetwork === 'mainnet' && walletStatus === 'connected' && isContractConfigured('mainnet')) {
      setMainnetConfirmOpen(true);
      return;
    }

    await executeRegistration();
  };

  const copyToClipboard = (text: string, type: 'hash' | 'id') => {
    navigator.clipboard.writeText(text);
    if (type === 'hash') {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
      addToast('SHA-256 Copied', 'Hash fingerprint copied to clipboard.');
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      addToast('Document ID Copied', 'ID copied to clipboard.');
    }
  };

  const resetForm = () => {
    setName('');
    setType('Property Deed');
    setDescription('');
    setOwner('');
    setIssueDate('');
    setExpiryDate('');
    setFile(null);
    setErrors({});
    setRegisteredResult(null);
  };

  const isMainnet = selectedNetwork === 'mainnet';

  return (
    <AppShell
      title="Register Document"
      subtitle={`Secure cryptographic registration and SHA-256 baseline generation for ${activeNetworkConfig.name}.`}
    >
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Network Info & Chain Verification Banner */}
        <div className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isMainnet 
            ? 'bg-purple-50/80 border-purple-200 text-purple-950' 
            : 'bg-blue-50/80 border-blue-200 text-blue-950'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isMainnet ? 'bg-purple-200 text-purple-800' : 'bg-blue-200 text-blue-800'
            }`}>
              {isMainnet ? <Flame className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            </div>
            <div>
              <div className="font-bold flex items-center gap-1.5">
                <span>Active Target: {activeNetworkConfig.name}</span>
                <span className="font-mono text-[10px] bg-white/70 px-1.5 py-0.5 rounded border border-black/5">
                  ID: {activeNetworkConfig.chainIdDecimal}
                </span>
              </div>
              <p className="text-[11px] opacity-80 mt-0.5">
                {isMainnet 
                  ? 'Mainnet transactions consume real MSTC gas and create permanent public records.' 
                  : 'Testnet transactions use simulated testnet MSTC for free development validation.'}
              </p>
            </div>
          </div>

          {/* Wallet mismatch warning and switch action */}
          {walletStatus === 'connected' && !isCorrectNetwork && (
            <button
              type="button"
              onClick={() => switchNetworkToMST(selectedNetwork)}
              className="py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Switch Wallet to {isMainnet ? 'Mainnet' : 'Testnet'}</span>
            </button>
          )}
        </div>

        {/* Success Result View */}
        {registeredResult ? (
          <Card className="p-8 space-y-6 bg-white border border-emerald-200 animate-in fade-in duration-300">
            <div className="flex items-center gap-4 border-b border-black/5 pb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1C1C1C]">
                  Document Registered Successfully
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Assigned ID and cryptographic fingerprint generated. Ready for immediate verification.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Document Summary */}
              <div className="md:col-span-2 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-400 block mb-0.5 font-medium">Document ID</span>
                    <div className="flex items-center justify-between font-mono font-bold text-stone-900 text-sm">
                      <span>{registeredResult.id}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(registeredResult.id, 'id')}
                        className="text-stone-400 hover:text-stone-700 p-1"
                        title="Copy Document ID"
                      >
                        {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-400 block mb-0.5 font-medium">Document Title</span>
                    <div className="font-semibold text-stone-900 truncate">{registeredResult.name}</div>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-400 block mb-0.5 font-medium">Classification</span>
                    <div className="font-semibold text-stone-900">{registeredResult.type}</div>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-400 block mb-0.5 font-medium">Registration Status</span>
                    <div className="mt-1">
                      <StatusPill status={registeredResult.status} size="sm" />
                    </div>
                  </div>
                </div>

                {/* On-Chain Anchoring Badge & Dynamic Explorer Links */}
                {registeredResult.onChainStatus === 'registered' && registeredResult.txHash ? (
                  <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>
                          Anchored on {registeredResult.networkKey === 'mainnet' ? 'MST Chain Mainnet' : 'MST Chain Testnet'}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                        Block #{registeredResult.blockNumber || 'Mined'}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-stone-700 break-all bg-white p-2.5 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <span className="truncate pr-2">{registeredResult.txHash}</span>
                      <a
                        href={getExplorerTxUrl(registeredResult.txHash, registeredResult.networkKey || selectedNetwork)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:underline shrink-0 text-[10px] font-bold inline-flex items-center gap-1"
                      >
                        <span>MSTScan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {registeredResult.contractAddress && (
                      <div className="flex items-center justify-between text-[11px] pt-1 text-emerald-900">
                        <span className="text-stone-500">Contract:</span>
                        <a
                          href={getExplorerAddressUrl(registeredResult.contractAddress, registeredResult.networkKey || selectedNetwork)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-emerald-700 hover:underline inline-flex items-center gap-1"
                        >
                          <span className="truncate max-w-[200px]">{registeredResult.contractAddress}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-stone-50 rounded-xl border border-black/5 text-[11px] text-stone-600 flex items-center justify-between">
                    <span>Baseline recorded in local catalog.</span>
                    <span className="text-[10px] text-stone-500 font-medium">
                      {isContractConfigured(selectedNetwork) 
                        ? (walletStatus === 'connected' ? `Ready for anchoring on ${activeNetworkConfig.name}` : `Connect wallet to anchor on ${activeNetworkConfig.name}`) 
                        : `Contract not deployed to ${activeNetworkConfig.name}`}
                    </span>
                  </div>
                )}

              </div>

              {/* QR Code Card */}
              <div className="flex flex-col items-center justify-center p-5 bg-[#FCFBF8] border border-black/5 rounded-2xl text-center space-y-3">
                <div className="p-3 bg-white rounded-xl shadow-xs border border-black/5">
                  <QRCodeSVG
                    value={`${window.location.origin}/verify/${registeredResult.id}`}
                    size={130}
                    level="M"
                  />
                </div>
                <div className="text-[11px] text-stone-500 font-medium leading-snug">
                  Scan to verify on public verification portal
                </div>
              </div>

            </div>

            {/* SHA-256 Digest Box */}
            <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                <span>Calculated SHA-256 Digest (Client WebCrypto)</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(registeredResult.sha256Hash, 'hash')}
                  className="text-[#1F6FF0] hover:underline flex items-center gap-1 font-mono text-[11px] cursor-pointer"
                >
                  {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedHash ? 'Copied' : 'Copy Hash'}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-stone-800 break-all bg-white p-3 rounded-xl border border-black/5 select-all">
                {registeredResult.sha256Hash}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={resetForm}
              >
                Register Another Document
              </Button>
              <Button
                variant="primary-app"
                size="md"
                onClick={() => navigate(`/app/documents/${registeredResult.id}`)}
              >
                View Document Details
              </Button>
            </div>
          </Card>
        ) : (
          /* Registration Input Form */
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Primary Details Card */}
            <Card className="p-6 md:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1C]">
                  Document Information
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Provide primary classification, ownership, and identification details.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Input
                    label="Document Title *"
                    placeholder="e.g. Master Title Deed - Parcel 442A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={errors.name}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                    Document Category *
                  </label>
                  <div className="space-y-2">
                    {documentTypes.map((t) => (
                      <OptionRow
                        key={t}
                        label={t}
                        selected={type === t}
                        onClick={() => setType(t)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <Input
                    label="Issuing Party / Registrant *"
                    placeholder="e.g. City Notary Office or Land Registry Dept"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    error={errors.owner}
                  />

                  <Input
                    type="date"
                    label="Date of Issue *"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    error={errors.issueDate}
                  />

                  <Input
                    type="date"
                    label="Expiry / Validity Date (Optional)"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <Textarea
                    label="Document Notes & Summary"
                    placeholder="Provide relevant contextual notes, conveyance clauses, or reference numbers..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </Card>

            {/* File Upload & SHA-256 Generator Card */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#1C1C1C]">
                    Document File & SHA-256 Generator
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Your file is processed client-side via WebCrypto. The document is never transmitted to any external server.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 bg-stone-50 px-2.5 py-1 rounded-xl border border-black/5 font-medium">
                  <Info className="w-3.5 h-3.5 text-stone-400" />
                  <span>100% Client-Side</span>
                </div>
              </div>

              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              />

              {file ? (
                /* File Selected Preview */
                <div className="p-4 bg-stone-50 border border-black/10 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#1F6FF0] flex items-center justify-center shrink-0">
                      <FileCheck2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#1C1C1C] truncate">
                        {file.name}
                      </div>
                      <div className="text-xs text-stone-500 font-mono mt-0.5">
                        {formatFileSize(file.size)} • {file.type || 'Document File'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="p-2 text-stone-400 hover:text-rose-600 transition-colors"
                    aria-label="Remove selected file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* Drag & Drop / Click Zone */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
                    errors.file 
                      ? 'border-red-300 bg-red-50/20' 
                      : 'border-black/15 hover:border-[#1F6FF0] hover:bg-blue-50/20'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-500 flex items-center justify-center mx-auto mb-3">
                    <UploadCloud className="w-6 h-6 stroke-[1.75]" />
                  </div>
                  <div className="text-sm font-bold text-[#1C1C1C]">
                    Click to browse or drag and drop document file
                  </div>
                  <div className="text-xs text-stone-400 mt-1">
                    PDF, PNG, JPG up to 20MB
                  </div>
                  {errors.file && (
                    <p className="text-xs font-semibold text-red-600 mt-3">{errors.file}</p>
                  )}
                </div>
              )}
            </Card>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => navigate('/app/documents')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary-app"
                size="md"
                loading={isSubmitting}
                icon={<ShieldCheck className="w-4 h-4" />}
                className={isMainnet ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
              >
                {isMainnet ? 'Register & Anchor to Mainnet' : 'Register & Compute SHA-256'}
              </Button>
            </div>

          </form>
        )}

      </div>

      {/* Mainnet Confirmation Modal */}
      <Modal
        isOpen={mainnetConfirmOpen}
        onClose={() => setMainnetConfirmOpen(false)}
        title="Confirm MST Mainnet Anchoring"
        subtitle="This operation broadcasts a permanent transaction to the public MST Chain Mainnet."
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Real Blockchain Assets Required</span>
            </div>
            <p className="leading-relaxed">
              You are preparing to anchor this document to <strong>MST Chain Mainnet (Chain ID 4646)</strong>.
              This transaction consumes <strong>real MSTC assets</strong> from your connected BridgeKey wallet and permanently inscribes the document ID and SHA-256 fingerprint on-chain.
            </p>
            <p className="font-semibold text-amber-950">
              Anchored records are immutable and irreversible.
            </p>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-black/5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mainnetAcknowledged}
              onChange={(e) => setMainnetAcknowledged(e.target.checked)}
              className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
            <span className="text-stone-700 leading-snug">
              I understand this transaction uses real assets on MST Mainnet and cannot be undone.
            </span>
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setMainnetConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary-app"
              size="sm"
              disabled={!mainnetAcknowledged}
              onClick={executeRegistration}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-40"
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
            >
              Confirm & Broadcast to Mainnet
            </Button>
          </div>
        </div>
      </Modal>

    </AppShell>
  );
};
