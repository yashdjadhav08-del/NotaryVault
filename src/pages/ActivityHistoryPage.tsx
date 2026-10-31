import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useDocuments } from '../context/DocumentContext';
import type { ActivityEventType } from '../types';
import { 
  Clock, 
  Search, 
  FileCheck2, 
  ShieldCheck, 
  Share2, 
  Ban, 
  Edit3, 
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { useWallet } from '../context/WalletContext';
import { getExplorerTxUrl } from '../services/contractService';

export const ActivityHistoryPage: React.FC = () => {
  const { activities, isSyncing, syncWithBlockchain } = useDocuments();
  const { selectedNetwork, activeNetworkConfig } = useWallet();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');

  const filteredActivities = activities.filter(act => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      act.title.toLowerCase().includes(q) ||
      act.description.toLowerCase().includes(q) ||
      (act.documentId && act.documentId.toLowerCase().includes(q));

    const matchesType = selectedEventType === 'all' || act.type === selectedEventType;
    return matchesSearch && matchesType;
  });

  const getEventIcon = (type: ActivityEventType) => {
    switch (type) {
      case 'Document Registered':
        return <FileCheck2 className="w-4 h-4 text-emerald-600" />;
      case 'Verification Completed':
      case 'Verification Requested':
        return <ShieldCheck className="w-4 h-4 text-[#1F6FF0]" />;
      case 'Document Shared':
        return <Share2 className="w-4 h-4 text-purple-600" />;
      case 'Access Revoked':
        return <Ban className="w-4 h-4 text-rose-600" />;
      case 'Document Details Updated':
        return <Edit3 className="w-4 h-4 text-amber-600" />;
      default:
        return <Clock className="w-4 h-4 text-stone-500" />;
    }
  };

  return (
    <AppShell
      title={`Activity History (${selectedNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'})`}
      subtitle={`Chronological audit trail of document registrations, verifications, and sharing events on ${activeNetworkConfig.name}.`}
      actions={
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : 'text-stone-500'}`} />}
          onClick={() => syncWithBlockchain(selectedNetwork, true)}
          title={`Sync audit trail from ${activeNetworkConfig.name}`}
        >
          <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync History'}</span>
        </Button>
      }
    >
      <div className="space-y-6">
        
        {/* Search & Event Type Filter */}
        <Card className="p-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            
            <div className="md:col-span-8">
              <Input
                placeholder="Search audit trail by keyword or Document ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4 text-stone-400" />}
              />
            </div>

            <div className="md:col-span-4">
              <select
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
                className="w-full bg-white text-[#1C1C1C] text-sm rounded-xl border border-black/15 py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0]"
              >
                <option value="all">All Event Types</option>
                <option value="Document Registered">Document Registered</option>
                <option value="Verification Completed">Verification Completed</option>
                <option value="Verification Requested">Verification Requested</option>
                <option value="Document Shared">Document Shared</option>
                <option value="Access Revoked">Access Revoked</option>
                <option value="Document Details Updated">Details Updated</option>
              </select>
            </div>

          </div>
        </Card>

        {/* Timeline of Events */}
        {activities.length === 0 ? (
          <EmptyState
            title={`No ${selectedNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'} activity available`}
            description={
              selectedNetwork === 'mainnet'
                ? "No activity records have been logged on MST Chain Mainnet. Smart contract is not yet deployed or transactions have not occurred."
                : "No activity has been logged yet on MST Chain Testnet. Document registrations, verification checks, and sharing events will be recorded here."
            }
          />
        ) : filteredActivities.length === 0 ? (
          <EmptyState
            title="No activity events found"
            description="No logged events match your current filter query. Clear filters to view full timeline."
            actionLabel="Reset filters"
            onAction={() => { setSearchQuery(''); setSelectedEventType('all'); }}
          />
        ) : (
          <Card className="p-6 md:p-8 bg-white">
            <div className="relative pl-6 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
              {filteredActivities.map(act => (
                <div key={act.id} className="relative flex items-start gap-4 group">
                  {/* Timeline Node Icon */}
                  <div className="absolute -left-6 w-6 h-6 rounded-full bg-white border-2 border-stone-300 group-hover:border-[#1F6FF0] flex items-center justify-center shrink-0 transition-colors shadow-sm">
                    {getEventIcon(act.type)}
                  </div>

                  {/* Event Content */}
                  <div className="flex-1 bg-stone-50/70 hover:bg-stone-50 p-4 rounded-2xl border border-black/5 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1.5 border-b border-black/[0.04]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[#1C1C1C]">
                          {act.title}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-200/60 font-medium text-stone-600">
                          {act.type}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                          (act.networkKey || selectedNetwork) === 'mainnet'
                            ? 'bg-purple-100 text-purple-900 border-purple-200'
                            : 'bg-blue-100 text-blue-900 border-blue-200'
                        }`}>
                          {(act.networkKey || selectedNetwork) === 'mainnet' ? 'MAINNET' : 'TESTNET'}
                        </span>
                        {act.isOnChain ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Confirmed On-Chain
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-200 text-stone-700">
                            Local Baseline
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-stone-400 font-mono" title={formatDateTime(act.timestamp)}>
                        {formatRelativeTime(act.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                      {act.description}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-black/[0.04] flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        {act.documentId && (
                          <Link
                            to={`/app/documents/${act.documentId}`}
                            className="inline-flex items-center gap-1 font-mono text-xs text-[#1F6FF0] hover:underline font-semibold"
                          >
                            <span>{act.documentId}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                        {act.txHash && (
                          <a
                            href={getExplorerTxUrl(act.txHash, act.networkKey || selectedNetwork)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-purple-700 hover:underline font-semibold"
                          >
                            <span>Tx: {act.txHash.slice(0, 12)}...</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <span className="text-[10px] text-stone-400">
                        {formatDateTime(act.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>
    </AppShell>
  );
};
