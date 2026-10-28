import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatusPill } from '../components/ui/StatusPill';
import { Modal } from '../components/ui/Modal';
import { OptionRow } from '../components/ui/OptionRow';
import { EmptyState } from '../components/ui/EmptyState';
import { useDocuments } from '../context/DocumentContext';
import type { SharedRecord } from '../types';
import { 
  Share2, 
  PlusCircle, 
  Search, 
  Ban, 
  Copy, 
  Check, 
  Mail, 
  ShieldAlert 
} from 'lucide-react';
import { formatDate } from '../lib/format';

export const SharedDocumentsPage: React.FC = () => {
  const { documents, sharedRecords, shareDocument, revokeSharing, addToast } = useDocuments();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Share Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(documents[0]?.id || '');
  const [recipient, setRecipient] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [durationLabel, setDurationLabel] = useState('7 Days');
  const [isSubmittingShare, setIsSubmittingShare] = useState(false);
  const [shareError, setShareError] = useState('');

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
    if (!recipient.trim() || !recipient.includes('@')) {
      setShareError('Please enter a valid recipient email address.');
      return;
    }
    if (!selectedDocId) {
      setShareError('Please select a document to share.');
      return;
    }

    setShareError('');
    setIsSubmittingShare(true);

    try {
      await shareDocument({
        documentId: selectedDocId,
        recipient: recipient.trim(),
        durationDays,
        durationLabel,
      });
      setShareModalOpen(false);
      setRecipient('');
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
                            {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
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
        onClose={() => setShareModalOpen(false)}
        title="Share Document Reference"
        subtitle="Generate a time-delimited inspection link for external reviewers or counsel."
      >
        <form onSubmit={handleShareSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              Select Document to Share *
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full bg-white text-[#1C1C1C] text-sm rounded-xl border border-black/15 py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0]"
            >
              {documents.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Recipient Email Address *"
            placeholder="e.g. auditor@bank.org"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            error={shareError}
          />

          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
              Access Duration
            </label>
            <div className="space-y-2">
              <OptionRow
                label="24 Hours (Immediate Inspection)"
                selected={durationDays === 1}
                onClick={() => { setDurationDays(1); setDurationLabel('24 Hours'); }}
              />
              <OptionRow
                label="7 Days (Standard Audit)"
                selected={durationDays === 7}
                onClick={() => { setDurationDays(7); setDurationLabel('7 Days'); }}
              />
              <OptionRow
                label="30 Days (Extended Due Diligence)"
                selected={durationDays === 30}
                onClick={() => { setDurationDays(30); setDurationLabel('30 Days'); }}
              />
            </div>
          </div>

          <div className="p-3 bg-stone-100 rounded-xl text-xs text-stone-600 leading-relaxed">
            <strong>Access Notice:</strong> Generating a share reference records an audit entry and creates a verifiable access link for this document.
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShareModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary-app"
              size="sm"
              loading={isSubmittingShare}
              icon={<Share2 className="w-4 h-4" />}
            >
              Create Share Reference
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
