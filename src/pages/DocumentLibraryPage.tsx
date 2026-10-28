import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatusPill } from '../components/ui/StatusPill';
import { EmptyState } from '../components/ui/EmptyState';
import { useDocuments } from '../context/DocumentContext';
import type { DocumentType } from '../types';
import { 
  Search, 
  PlusCircle, 
  FileText, 
  ChevronRight
} from 'lucide-react';
import { formatDate } from '../lib/format';

export const DocumentLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { documents } = useDocuments();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'name-asc'>('date-desc');

  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      // Search matching
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        doc.name.toLowerCase().includes(query) ||
        doc.id.toLowerCase().includes(query) ||
        doc.owner.toLowerCase().includes(query) ||
        doc.type.toLowerCase().includes(query);

      // Type filter
      const matchesType = selectedType === 'all' || doc.type === selectedType;

      // Status filter
      const matchesStatus = selectedStatus === 'all' || doc.status === selectedStatus;

      return matchesSearch && matchesType && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'date-desc') {
        return new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime();
      } else if (sortBy === 'date-asc') {
        return new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime();
      } else {
        return a.name.localeCompare(b.name);
      }
    });
  }, [documents, searchQuery, selectedType, selectedStatus, sortBy]);

  const documentTypes: DocumentType[] = [
    'Property Deed',
    'Sale Agreement',
    'Rental Agreement',
    'Affidavit',
    'Power of Attorney'
  ];

  return (
    <AppShell
      title="Document Library"
      subtitle="Search, filter, and inspect registered legal deeds and cryptographic verification records."
      actions={
        <Button
          variant="primary-app"
          size="sm"
          icon={<PlusCircle className="w-4 h-4" />}
          onClick={() => navigate('/app/register')}
        >
          Register Document
        </Button>
      }
    >
      <div className="space-y-6">
        
        {/* Filter and Search Bar */}
        <Card className="p-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            
            {/* Search Input (5 cols) */}
            <div className="md:col-span-5">
              <Input
                placeholder="Search by name, ID (e.g. NV-2026-000101), or owner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4 text-stone-400" />}
              />
            </div>

            {/* Type Filter (3 cols) */}
            <div className="md:col-span-3">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-white text-[#1C1C1C] text-sm rounded-xl border border-black/15 py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0]"
              >
                <option value="all">All Document Types</option>
                {documentTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Status Filter (2 cols) */}
            <div className="md:col-span-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-white text-[#1C1C1C] text-sm rounded-xl border border-black/15 py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0]"
              >
                <option value="all">All Statuses</option>
                <option value="Verified">Verified</option>
                <option value="Pending">Pending Review</option>
                <option value="Hash Mismatch">Hash Mismatch</option>
                <option value="Registered">Registered</option>
              </select>
            </div>

            {/* Sort (2 cols) */}
            <div className="md:col-span-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-white text-[#1C1C1C] text-sm rounded-xl border border-black/15 py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0]"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="name-asc">Name (A-Z)</option>
              </select>
            </div>

          </div>

          {/* Active Filter Summary and Clear Action */}
          {(searchQuery || selectedType !== 'all' || selectedStatus !== 'all') && (
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-black/[0.04] text-xs text-stone-500">
              <div>
                Showing <span className="font-semibold text-stone-800">{filteredDocs.length}</span> of {documents.length} records
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedType('all');
                  setSelectedStatus('all');
                }}
                className="text-[#1F6FF0] hover:underline font-semibold"
              >
                Reset filters
              </button>
            </div>
          )}
        </Card>

        {/* Documents Table */}
        {documents.length === 0 ? (
          <EmptyState
            title="No documents available"
            description="You haven't registered any documents yet. Register your first property deed or legal agreement to begin tracking."
            actionLabel="Register Document"
            onAction={() => navigate('/app/register')}
          />
        ) : filteredDocs.length === 0 ? (
          <EmptyState
            title="No matching documents found"
            description="Try adjusting your search criteria or resetting filters to see available records."
            actionLabel="Reset filters"
            onAction={() => {
              setSearchQuery('');
              setSelectedType('all');
              setSelectedStatus('all');
            }}
          />
        ) : (
          <Card className="overflow-hidden border border-black/[0.08]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-black/[0.06] text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Document Details</th>
                    <th className="py-3.5 px-4">Document ID</th>
                    <th className="py-3.5 px-4">Classification</th>
                    <th className="py-3.5 px-4">Owner / Submitter</th>
                    <th className="py-3.5 px-4">Registered Date</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06] text-sm">
                  {filteredDocs.map(doc => (
                    <tr
                      key={doc.id}
                      onClick={() => navigate(`/app/documents/${doc.id}`)}
                      className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                    >
                      {/* Name & File */}
                      <td className="py-4 px-6 min-w-[240px]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-stone-100 group-hover:bg-blue-100/60 text-stone-600 group-hover:text-[#1F6FF0] flex items-center justify-center shrink-0 transition-colors">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-[#1C1C1C] group-hover:text-[#1F6FF0] transition-colors leading-snug">
                              {doc.name}
                            </div>
                            <div className="text-xs text-stone-400 font-mono mt-0.5">
                              {doc.fileName}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Document ID */}
                      <td className="py-4 px-4 font-mono text-xs font-semibold text-stone-700 whitespace-nowrap">
                        {doc.id}
                      </td>

                      {/* Type */}
                      <td className="py-4 px-4 text-xs text-stone-600 whitespace-nowrap">
                        {doc.type}
                      </td>

                      {/* Owner */}
                      <td className="py-4 px-4 text-xs font-medium text-stone-800 whitespace-nowrap">
                        {doc.owner}
                      </td>

                      {/* Date */}
                      <td className="py-4 px-4 text-xs text-stone-500 whitespace-nowrap">
                        {formatDate(doc.registeredAt)}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <StatusPill status={doc.status} size="sm" />
                      </td>

                      {/* Action */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1F6FF0] group-hover:translate-x-0.5 transition-transform">
                          <span>View Details</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table Footer Count */}
            <div className="px-6 py-3.5 bg-stone-50/60 border-t border-black/[0.04] text-xs text-stone-500 flex items-center justify-between">
              <span>Displaying {filteredDocs.length} documents</span>
              <span className="font-mono text-[11px] text-stone-400">All hashes computed client-side</span>
            </div>
          </Card>
        )}

      </div>
    </AppShell>
  );
};
