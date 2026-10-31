import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatusPill } from '../components/ui/StatusPill';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { useDocuments } from '../context/DocumentContext';
import type { SharedRecord, DocumentRecord } from '../types';
import { 
  PlusCircle, 
  Search, 
  Ban, 
  Copy, 
  Mail, 
  ShieldAlert,
  Send,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { formatDate } from '../lib/format';
import { useWallet } from '../context/WalletContext';
import { 
  shareDocumentWithDelivery, 
  authenticateOwnerWithWallet,
  type DocumentShareResult 
} from '../lib/pdfStorage';

export const SharedDocumentsPage: React.FC = () => {
  const { documents, sharedRecords, shareDocument, revokeSharing, addToast } = useDocuments();
  const { address: walletAddress, status: walletStatus, provider, isAuthor, isSuperAuthor, selectedNetwork } = useWallet();

  const shareableDocuments = useMemo<DocumentRecord[]>(() => {
    if (!isAuthor) return [];
    if (isSuperAuthor) return documents;
    if (!walletAddress) return [];
    const addr = walletAddress.trim().toLowerCase();
    return documents.filter((d: DocumentRecord) => {
      const reg = (d.registrantAddress || '').trim().toLowerCase();
      const owner = (d.owner || '').trim().toLowerCase();
      return reg === addr || owner === addr;
    });
  }, [documents, isAuthor, isSuperAuthor, walletAddress]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Share Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(shareableDocuments[0]?.id || documents[0]?.id || '');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sendPdfByEmail, setSendPdfByEmail] = useState(true);
  const [recipientConsent, setRecipientConsent] = useState(true);
  const [expiryPolicy, setExpiryPolicy] = useState<'1h' | '24h' | '7d' | '30d' | '90d' | 'never'>('24h');
  const [isSubmittingShare, setIsSubmittingShare] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareDeliveryResult, setShareDeliveryResult] = useState<DocumentShareResult | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Revoke Confirm Modal State
  const [recordToRevoke, setRecordToRevoke] = useState<SharedRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredShared = sharedRecords.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      item.documentName.toLowerCase().includes(q) ||
      item.recipient.toLowerCase().includes(q) ||
      item.documentId.toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShareError('');
    setShareDeliveryResult(null);

    if (!isAuthor) {
      setShareError('Document sharing is restricted to authorized authors.');
      return;
    }

    const docToShare = shareableDocuments.find((d: DocumentRecord) => d.id === selectedDocId);
    if (!docToShare) {
      setShareError('You are only authorized to share documents you registered or manage.');
      return;
    }

    if (!selectedDocId) {
      setShareError('Please select a document to share.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!recipientEmail.trim() || !emailRegex.test(recipientEmail.trim())) {
      setShareError('Please enter a valid recipient email address (e.g. counsel@notaryvault.org).');
      return;
    }

    if (!recipientConsent && sendPdfByEmail) {
      setShareError('Please confirm recipient consent to receive notifications.');
      return;
    }

    setIsSubmittingShare(true);

    try {
      if (walletStatus !== 'connected' || !provider || !walletAddress) {
        throw new Error('Wallet is disconnected. Please reconnect your wallet.');
      }

      const session = await authenticateOwnerWithWallet(
        provider,
        walletAddress,
        { expectedNetworkKey: selectedNetwork }
      );

      const res = await shareDocumentWithDelivery({
        documentId: selectedDocId,
        sessionToken: session.token,
        recipientEmail: recipientEmail.trim(),
        recipientMobile: undefined,
        sendEmail: sendPdfByEmail,
        sendSms: false,
        expiryPolicy,
        purpose: 'Verified Document Share',
        recipientConsent,
      });

      setShareDeliveryResult(res);

      if (res.success) {
        if (sendPdfByEmail) {
          if (res.emailDelivery?.status === 'accepted') {
            addToast('Document Shared & Email Delivered', `Original PDF successfully dispatched to ${recipientEmail.trim()}.`);
          } else if (res.emailDelivery?.status === 'unconfigured') {
            addToast('Share Link Created', 'Secure access link created. Email provider is not configured in environment.', 'warning');
          } else if (res.emailDelivery?.status === 'failed') {
            addToast('Email Delivery Failed', res.emailDelivery.error || 'Email delivery failed. Please check the email provider configuration.', 'error');
          } else {
            addToast('Document Shared', 'Document share reference created.');
          }
        } else {
          addToast('Document Shared', 'Secure document access link created.');
        }

        const durationDisplay = expiryPolicy === 'never' ? 'No Fixed Expiry' : expiryPolicy;
        await shareDocument({
          documentId: selectedDocId,
          recipient: recipientEmail.trim() || 'Confidential Recipient',
          durationDays: expiryPolicy === '1h' ? 0.04 : (expiryPolicy === '24h' ? 1 : (expiryPolicy === '7d' ? 7 : (expiryPolicy === '30d' ? 30 : (expiryPolicy === '90d' ? 90 : 365)))),
          durationLabel: durationDisplay,
        });
      } else {
        const errorMsg = res.error || 'Failed to dispatch document share.';
        setShareError(errorMsg);
        addToast('Share Failed', errorMsg, 'error');
      }
    } catch (err: any) {
      const displayMsg = err?.message || 'Authorization failed. Please reconnect your wallet and retry.';
      setShareError(displayMsg);
      addToast('Share Error', displayMsg, 'error');
    } finally {
      setIsSubmittingShare(false);
    }
  };

  const handleConfirmRevoke = () => {
    if (!recordToRevoke) return;
    revokeSharing(recordToRevoke.id);
    setRecordToRevoke(null);
  };

  const copyShareLink = (item: SharedRecord) => {
    const link = `${window.location.origin}/verify/${item.documentId}?ref=${item.id}`;
    navigator.clipboard.writeText(link);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
    addToast('Share Link Copied', `Reference link for ${item.recipient} copied.`);
  };

  return (
    <AppShell
      title="Shared Documents"
      subtitle="Track external document inspection references, time limits, and access permissions."
      actions={
        isAuthor ? (
          <Button
            variant="primary-app"
            size="sm"
            icon={<PlusCircle className="w-4 h-4" />}
            onClick={() => {
              if (documents.length > 0 && !selectedDocId) {
                setSelectedDocId(documents[0].id);
              }
              setShareModalOpen(true);
            }}
          >
            Share Document
          </Button>
        ) : null
      }
    >
      <div className="space-y-6">
        
        {/* Search & Status Filter */}
        <Card className="p-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <div className="md:col-span-8">
              <Input
                placeholder="Search by recipient email, document name, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4 text-stone-400" />}
              />
            </div>
            <div className="md:col-span-4">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-white text-[#1C1C1C] text-sm rounded-xl border border-black/15 py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0]"
              >
                <option value="all">All Access Statuses</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
                <option value="Revoked">Revoked</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Table of Shared Records */}
        {sharedRecords.length === 0 ? (
          <EmptyState
            title="No shared documents"
            description={
              isAuthor
                ? documents.length > 0
                  ? "No documents have been shared yet. Grant time-limited inspection references to outside reviewers."
                  : "No documents have been shared yet. Register a document first to generate sharing references."
                : "Sharing documents and access permissions are restricted to authorized authors and document owners."
            }
            actionLabel={isAuthor && documents.length > 0 ? "Share a Document" : undefined}
            onAction={isAuthor && documents.length > 0 ? () => setShareModalOpen(true) : undefined}
          />
        ) : filteredShared.length === 0 ? (
          <EmptyState
            title="No matching shared records found"
            description="No shared document records match your search or status filter."
            actionLabel="Reset filters"
            onAction={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <Card className="overflow-hidden border border-black/[0.08]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-black/[0.06] text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Document</th>
                    <th className="py-3.5 px-4">Recipient</th>
                    <th className="py-3.5 px-4">Shared Date</th>
                    <th className="py-3.5 px-4">Expiration</th>
                    <th className="py-3.5 px-4">Access Status</th>
                    <th className="py-3.5 px-4">Access Count</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06] text-sm">
                  {filteredShared.map(item => (
                    <tr key={item.id} className="hover:bg-stone-50/60 transition-colors">
                      {/* Document Name & ID */}
                      <td className="py-4 px-6 min-w-[220px]">
                        <Link 
                          to={`/app/documents/${item.documentId}`}
                          className="font-bold text-[#1C1C1C] hover:text-[#1F6FF0] transition-colors leading-snug block"
                        >
                          {item.documentName}
                        </Link>
                        <span className="font-mono text-xs text-stone-500">
                          {item.documentId}
                        </span>
                      </td>

                      {/* Recipient */}
                      <td className="py-4 px-4 font-medium text-stone-800 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-stone-400" />
                          <span>{item.recipient}</span>
                        </div>
                      </td>

                      {/* Shared Date */}
                      <td className="py-4 px-4 text-xs text-stone-500 whitespace-nowrap">
                        {formatDate(item.sharedAt)}
                      </td>

                      {/* Expiration */}
                      <td className="py-4 px-4 text-xs text-stone-500 whitespace-nowrap">
                        {formatDate(item.expiresAt)}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <StatusPill status={item.status} size="sm" />
                      </td>

                      {/* Access Count */}
                      <td className="py-4 px-4 text-xs font-mono text-stone-600">
                        {item.accessCount} visits
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => copyShareLink(item)}
                            className="p-1.5 text-stone-500 hover:text-[#1F6FF0] rounded-lg hover:bg-stone-100 cursor-pointer"
                            title="Copy share URL"
                          >
                            {copiedId === item.id ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                          </button>

                          {item.status === 'Active' && isAuthor && (
                            <button
                              onClick={() => setRecordToRevoke(item)}
                              className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                            >
                              Revoke Access
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3.5 bg-stone-50/60 border-t border-black/[0.04] text-xs text-stone-500">
              Inspection references are recorded locally. External access permissions can be revoked at any time.
            </div>
          </Card>
        )}

      </div>

      {/* =========================================================================
          SHARE MODAL
          ========================================================================= */}
      <Modal
        isOpen={shareModalOpen}
        onClose={() => { setShareModalOpen(false); setShareDeliveryResult(null); }}
        title="Share Document"
        subtitle="Deliver original PDF via email with verified cryptographic access links."
      >
        <form onSubmit={handleShareSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              Select Document to Share *
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => {
                setSelectedDocId(e.target.value);
                setShareDeliveryResult(null);
              }}
              className="w-full bg-white text-[#1C1C1C] text-sm rounded-xl border border-black/15 py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0]"
            >
              {shareableDocuments.map((d: DocumentRecord) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>
          </div>

          {/* Delivery Channels */}
          <div className="space-y-3">
            {/* Active Email Channel */}
            <div className="p-3.5 bg-blue-50/50 rounded-xl border border-[#1F6FF0]/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#1F6FF0]" />
                  <span className="text-xs font-bold text-stone-900">Email Delivery (PDF Attachment)</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Active
                </span>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-stone-800">
                <input
                  type="checkbox"
                  checked={sendPdfByEmail}
                  onChange={(e) => setSendPdfByEmail(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300 text-[#1F6FF0] focus:ring-[#1F6FF0]"
                />
                <div>
                  <span className="font-semibold block text-stone-900">Send PDF as Email Attachment</span>
                  <span className="text-[11px] text-stone-600">
                    The server retrieves original PDF from private storage, recomputes SHA-256 against on-chain hash, and attaches it directly to the email.
                  </span>
                </div>
              </label>
            </div>

            {/* Recipient Email */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
                  Recipient Email Address *
                </label>
              </div>
              <Input
                placeholder="e.g. counsel@notaryvault.org"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                disabled={isSubmittingShare}
              />
            </div>

            {/* Mobile Sharing — Coming Soon */}
            <div 
              id="shared-mobile-sharing-coming-soon-card"
              className="p-3.5 bg-stone-100/70 rounded-xl border border-dashed border-stone-300 space-y-2 opacity-85 select-none"
              aria-disabled="true"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base select-none" aria-hidden="true">📱</span>
                  <span className="text-xs font-bold text-stone-700">Mobile Sharing</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-200 text-stone-600 border border-stone-300">
                  Coming Soon
                </span>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                Share documents securely via mobile number and SMS. This feature will be available in a future update.
              </p>
              <div className="space-y-1 pt-1">
                <input
                  id="shared-recipient-mobile-input-disabled"
                  type="text"
                  disabled
                  readOnly
                  placeholder="Recipient Mobile Number (Disabled — Coming Soon)"
                  className="w-full text-xs bg-stone-200/50 text-stone-400 border border-stone-300 rounded-lg py-2 px-3 cursor-not-allowed select-none opacity-70"
                />
              </div>
            </div>
          </div>

          {/* Expiry Policy Selector */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
              Access Expiry Policy
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '1h', label: '1 Hour' },
                { id: '24h', label: '24 Hours' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: '90d', label: '90 Days' },
                { id: 'never', label: 'No Fixed Expiry' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setExpiryPolicy(opt.id as any)}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition-all text-center ${
                    expiryPolicy === opt.id
                      ? 'border-[#1F6FF0] bg-blue-50 text-[#1F6FF0]'
                      : 'border-black/10 bg-white text-stone-700 hover:border-black/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {expiryPolicy === 'never' && (
              <p className="text-[11px] text-stone-500 mt-1.5 leading-tight">
                * No-expiry links remain subject to server-side cryptographic authorization and can be revoked by the owner at any time.
              </p>
            )}
          </div>

          {/* Recipient Consent Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700 pt-1">
            <input
              type="checkbox"
              checked={recipientConsent}
              onChange={(e) => setRecipientConsent(e.target.checked)}
              className="rounded border-stone-300 text-[#1F6FF0] focus:ring-[#1F6FF0]"
            />
            <span>I confirm recipient consent to receive this document notification.</span>
          </label>

          {shareError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{shareError}</span>
            </div>
          )}

          {/* Delivery Status Card after Send */}
          {shareDeliveryResult && (() => {
            const isEmailReq = Boolean(sendPdfByEmail);
            const emailStatus = shareDeliveryResult.emailDelivery?.status;
            const isEmailFailed = isEmailReq && emailStatus === 'failed';
            const isEmailUnconfigured = isEmailReq && emailStatus === 'unconfigured';
            const isEmailAccepted = isEmailReq && emailStatus === 'accepted';

            return (
              <div className={`p-4 rounded-xl border space-y-3 ${
                isEmailFailed 
                  ? 'bg-rose-50/70 border-rose-200' 
                  : isEmailUnconfigured 
                  ? 'bg-amber-50/70 border-amber-200' 
                  : 'bg-emerald-50/50 border-emerald-200'
              }`}>
                {/* State-Accurate Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {isEmailFailed ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span className="text-rose-900">Email Delivery Failed</span>
                      </>
                    ) : isEmailUnconfigured ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-amber-900">Share Reference Generated (Email Not Sent)</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-emerald-900">
                          {isEmailAccepted ? 'Document Shared & Email Dispatched' : 'Secure Access Link Generated'}
                        </span>
                      </>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isEmailFailed
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : isEmailUnconfigured
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    {isEmailFailed
                      ? 'Delivery Failed'
                      : isEmailUnconfigured
                      ? 'Provider Unconfigured'
                      : isEmailAccepted
                      ? 'Accepted by Provider'
                      : 'Direct Link Created'}
                  </span>
                </div>

                {/* Diagnostic Error Box when Email Fails */}
                {isEmailFailed && (
                  <div className="p-3 bg-white/90 rounded-lg border border-rose-200/80 text-xs space-y-1.5">
                    <div className="font-semibold text-rose-900 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Failure Explanation:</span>
                    </div>
                    <p className="text-rose-800 text-[11px] leading-relaxed break-words font-medium">
                      {shareDeliveryResult.emailDelivery?.error || 'The email provider rejected the delivery request.'}
                    </p>
                    <div className="pt-2 flex items-center justify-between border-t border-rose-100">
                      <p className="text-[10px] text-stone-500">
                        Note: Token created, but delivery failed. You can update the address above and retry without another blockchain transaction.
                      </p>
                      <Button
                        type="button"
                        variant="primary-app"
                        size="sm"
                        loading={isSubmittingShare}
                        onClick={handleShareSubmit}
                        icon={<Send className="w-3.5 h-3.5" />}
                      >
                        Retry Delivery
                      </Button>
                    </div>
                  </div>
                )}

                {/* Diagnostic Notice when Provider Unconfigured */}
                {isEmailUnconfigured && (
                  <div className="p-3 bg-white/90 rounded-lg border border-amber-200 text-xs space-y-1">
                    <p className="text-amber-900 text-[11px] leading-relaxed">
                      {shareDeliveryResult.emailDelivery?.error || 'No email delivery provider is configured in environment (.env). Configure RESEND_API_KEY or SMTP settings to enable automated dispatch.'}
                    </p>
                  </div>
                )}

                {/* Provider Acceptance Details */}
                {isEmailAccepted && (
                  <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 text-xs text-emerald-900 space-y-0.5">
                    <p className="text-[11px] leading-relaxed">
                      Send request accepted by provider{shareDeliveryResult.emailDelivery?.deliveryId ? ` (ID: ${shareDeliveryResult.emailDelivery.deliveryId})` : ''}. Verified PDF attached.
                    </p>
                  </div>
                )}

                {/* Email Delivery Detail Row */}
                {isEmailReq && (
                  <div className="flex items-center justify-between text-xs p-2.5 bg-white rounded-lg border border-black/5">
                    <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-stone-500" />
                      <span>Recipient:</span>
                    </span>
                    <span className="font-mono text-stone-800 text-xs">{recipientEmail}</span>
                  </div>
                )}

                {/* Secure Link */}
                {shareDeliveryResult.secureAccessUrl && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                      Secure Access URL
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={shareDeliveryResult.secureAccessUrl}
                        className="flex-1 text-xs font-mono bg-white p-2 rounded border border-black/10 select-all"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={copiedShareLink ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        onClick={() => {
                          navigator.clipboard.writeText(shareDeliveryResult.secureAccessUrl || '');
                          setCopiedShareLink(true);
                          setTimeout(() => setCopiedShareLink(false), 2000);
                        }}
                      >
                        {copiedShareLink ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { setShareModalOpen(false); setShareDeliveryResult(null); }}
            >
              Close
            </Button>
            <Button
              type="submit"
              variant="primary-app"
              size="sm"
              loading={isSubmittingShare}
              icon={<Send className="w-4 h-4" />}
            >
              Send Document
            </Button>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          CONFIRM REVOKE MODAL
          ========================================================================= */}
      <Modal
        isOpen={!!recordToRevoke}
        onClose={() => setRecordToRevoke(null)}
        title="Revoke Shared Access"
        subtitle="Confirm immediate termination of external inspection permissions."
      >
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-900 leading-relaxed">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              Are you sure you want to revoke access for <strong>{recordToRevoke?.recipient}</strong> to document <strong>{recordToRevoke?.documentName}</strong>? External reference links will immediately return Revoked status.
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRecordToRevoke(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Ban className="w-4 h-4" />}
              onClick={handleConfirmRevoke}
            >
              Confirm Revocation
            </Button>
          </div>
        </div>
      </Modal>

    </AppShell>
  );
};
