import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatusPill } from '../components/ui/StatusPill';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { useDocuments } from '../context/DocumentContext';
import type { SharedRecord } from '../types';
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
  requestAuthChallenge, 
  verifyAuthSignature, 
  getClientSession, 
  type DocumentShareResult 
} from '../lib/pdfStorage';

export const SharedDocumentsPage: React.FC = () => {
  const { documents, sharedRecords, shareDocument, revokeSharing, addToast } = useDocuments();
  const { address: walletAddress, status: walletStatus, provider } = useWallet();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Share Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(documents[0]?.id || '');
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
      let session = getClientSession();
      const activeAddr = walletAddress?.toLowerCase();
      const isSessionValid = session && (!activeAddr || session.walletAddress.toLowerCase() === activeAddr);

      if (!isSessionValid) {
        if (walletStatus !== 'connected' || !provider || !walletAddress) {
          addToast('Wallet Connection Required', 'Please connect your owner wallet to authorize document sharing.', 'warning');
          setShareError('Owner wallet connection required for authorization.');
          setIsSubmittingShare(false);
          return;
        }

        const challenge = await requestAuthChallenge(walletAddress);
        const signer = await provider.getSigner();
        const signature = await signer.signMessage(challenge.challengeText);

        const verifyRes = await verifyAuthSignature({
          address: walletAddress,
          signature,
          challengeId: challenge.challengeId,
          challengeText: challenge.challengeText,
        });

        if (!verifyRes.success || !verifyRes.session) {
          throw new Error(verifyRes.error || 'Authentication signature rejected.');
        }
        session = verifyRes.session;
      }

      if (!session) throw new Error('Session could not be established.');

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
        const durationDisplay = expiryPolicy === 'never' ? 'No Fixed Expiry' : expiryPolicy;
        await shareDocument({
          documentId: selectedDocId,
          recipient: recipientEmail.trim() || 'Confidential Recipient',
          durationDays: expiryPolicy === '1h' ? 0.04 : (expiryPolicy === '24h' ? 1 : (expiryPolicy === '7d' ? 7 : (expiryPolicy === '30d' ? 30 : (expiryPolicy === '90d' ? 90 : 365)))),
          durationLabel: durationDisplay,
        });

        addToast('Document Shared', 'Document share dispatched with server-side authorization.');
      } else {
        setShareError(res.error || 'Failed to dispatch document share.');
        addToast('Share Failed', res.error || 'Delivery failed.', 'error');
      }
    } catch (err: any) {
      setShareError(err?.message || 'Authorization failed.');
      addToast('Share Error', err?.message || 'Failed to dispatch document share.', 'error');
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
            description={documents.length > 0 
              ? "No documents have been shared yet. Grant time-limited inspection references to outside reviewers."
              : "No documents have been shared yet. Register a document first to generate sharing references."
            }
            actionLabel={documents.length > 0 ? "Share a Document" : undefined}
            onAction={documents.length > 0 ? () => setShareModalOpen(true) : undefined}
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

                          {item.status === 'Active' && (
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
              {documents.map(d => (
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
          {shareDeliveryResult && (
            <div className="p-4 bg-stone-50 rounded-xl border border-black/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Share Reference Generated</span>
              </div>

              {/* Email Status */}
              {sendPdfByEmail && (
                <div className="flex items-center justify-between text-xs p-2.5 bg-white rounded-lg border border-black/5">
                  <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-stone-500" />
                    <span>Email Delivery:</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    shareDeliveryResult.emailDelivery?.status === 'accepted'
                      ? 'bg-emerald-100 text-emerald-800'
                      : shareDeliveryResult.emailDelivery?.status === 'unconfigured'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {shareDeliveryResult.emailDelivery?.status === 'accepted'
                      ? 'Accepted by Provider'
                      : shareDeliveryResult.emailDelivery?.status === 'unconfigured'
                      ? 'Provider Not Configured'
                      : 'Delivery Failed'}
                  </span>
                </div>
              )}


              {/* Secure Link */}
              {shareDeliveryResult.secureAccessUrl && (
                <div className="space-y-1">
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
          )}

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
