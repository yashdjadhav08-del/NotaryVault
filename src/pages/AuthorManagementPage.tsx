import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Input';
import { useWallet } from '../context/WalletContext';
import { useAuthors } from '../context/AuthorContext';
import { getExplorerAddressUrl, getExplorerTxUrl } from '../services/contractService';
import { formatDate } from '../lib/format';
import { truncateHash } from '../lib/hash';
import type { AuthorizedAuthorRecord } from '../types';
import { 
  UserCheck, 
  UserX, 
  ExternalLink, 
  Crown, 
  AlertTriangle
} from 'lucide-react';

export const AuthorManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    isSuperAuthor, 
    isAuthor,
    contractAdminAddress, 
    provider, 
    selectedNetwork 
  } = useWallet();
  const { 
    authorizedAuthors, 
    deauthorizeAuthor 
  } = useAuthors();

  const [selectedAuthor, setSelectedAuthor] = useState<AuthorizedAuthorRecord | null>(null);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDeauthorizeConfirm = async () => {
    if (!selectedAuthor) return;
    setIsProcessing(true);
    try {
      await deauthorizeAuthor(selectedAuthor.walletAddress, revokeReason, provider);
      setRevokeModalOpen(false);
      setSelectedAuthor(null);
      setRevokeReason('');
    } finally {
      setIsProcessing(false);
    }
  };

  const superAuthorAddress = contractAdminAddress || '0x6D9618b1Ee522d22f3C168B40A33466A89af00C4';

  if (!isAuthor) {
    return (
      <AppShell
        title="Author Directory & Management"
        subtitle="Authorized notary registries, Super Author authority, and Secondary Author permissions."
      >
        <div className="max-w-2xl mx-auto py-12">
          <Card className="p-8 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-stone-900">Author Directory Access Restricted</h3>
              <p className="text-xs text-stone-500 leading-relaxed max-w-md">
                Viewing authorized notary directories and registry authorities is restricted to verified authors. Public Users can apply for Secondary Author status.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="primary-app"
                size="md"
                onClick={() => navigate('/app/apply-author')}
              >
                Apply to Become an Author
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => navigate('/app')}
              >
                Return to Dashboard
              </Button>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Author Directory & Management"
      subtitle="Authorized notary registries, Super Author authority, and Secondary Author permissions."
    >
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Root Super Author Card */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Super Author (Root Authority)
            </h3>
          </div>

          <Card className="p-6 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/40 border border-amber-200/90 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Crown className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base font-bold text-stone-900">
                      NotaryVault Super Author
                    </h4>
                    <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-mono">
                      Administrator
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-stone-500 font-mono">
                    <span>{truncateHash(superAuthorAddress, 10, 10)}</span>
                    <a
                      href={getExplorerAddressUrl(superAuthorAddress, selectedNetwork)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1F6FF0] hover:underline inline-flex items-center gap-1 font-sans font-semibold"
                    >
                      <span>MSTScan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="text-xs text-stone-500 text-right sm:max-w-xs leading-relaxed">
                Holds root authority to approve/reject author applications and grant or revoke Secondary Author permissions.
              </div>
            </div>
          </Card>
        </div>

        {/* Secondary Authors Directory */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#1F6FF0]" />
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                Secondary Authors Directory ({authorizedAuthors.length})
              </h3>
            </div>
            {!isSuperAuthor && (
              <span className="text-[11px] text-stone-400">
                Directory view • Permission management restricted to Super Author
              </span>
            )}
          </div>

          {authorizedAuthors.length === 0 ? (
            <Card className="p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                <UserCheck className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-stone-800">
                No Secondary Authors Registered Yet
              </h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Applications submitted by public users will appear in the Super Author review portal before receiving author status.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {authorizedAuthors.map(author => (
                <Card 
                  key={author.walletAddress} 
                  className={`p-6 space-y-4 transition-all ${
                    author.isActive 
                      ? 'border-black/10 hover:border-black/20' 
                      : 'border-red-200 bg-stone-50/50 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-black/[0.06]">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-[#1C1C1C]">
                          {author.name}
                        </h4>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full font-mono ${
                          author.isActive
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {author.isActive ? 'Active Author' : 'Revoked'}
                        </span>
                      </div>
                      <span className="text-xs text-stone-500 mt-0.5 block">
                        {author.organization}
                      </span>
                    </div>

                    {/* Super Author deauthorization control */}
                    {isSuperAuthor && author.isActive && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedAuthor(author);
                          setRevokeModalOpen(true);
                        }}
                        className="text-red-700 hover:bg-red-50 text-xs shrink-0"
                      >
                        <UserX className="w-3.5 h-3.5 mr-1" />
                        Deauthorize
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 bg-stone-50 rounded-xl">
                      <span className="text-stone-400 font-medium block mb-0.5">License ID</span>
                      <span className="font-mono font-bold text-stone-900">{author.licenseNumber}</span>
                    </div>
                    <div className="p-2.5 bg-stone-50 rounded-xl">
                      <span className="text-stone-400 font-medium block mb-0.5">Authorized Date</span>
                      <span className="font-bold text-stone-900">{formatDate(author.authorizedAt)}</span>
                    </div>
                    <div className="p-2.5 bg-stone-50 rounded-xl col-span-2">
                      <span className="text-stone-400 font-medium block mb-0.5">Wallet Address</span>
                      <div className="flex items-center justify-between font-mono font-bold text-stone-900">
                        <span>{truncateHash(author.walletAddress, 8, 8)}</span>
                        <a
                          href={getExplorerAddressUrl(author.walletAddress, selectedNetwork)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1F6FF0] hover:underline inline-flex items-center gap-1 font-sans text-[11px]"
                        >
                          <span>Explorer</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {author.txHash && (
                    <div className="pt-1 text-[11px] text-stone-500 flex items-center justify-between">
                      <span>On-chain confirmation:</span>
                      <a
                        href={getExplorerTxUrl(author.txHash, selectedNetwork)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#1F6FF0] hover:underline font-mono inline-flex items-center gap-1"
                      >
                        <span>{author.txHash.slice(0, 10)}...</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                </Card>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Revoke Permission Modal */}
      <Modal
        isOpen={revokeModalOpen}
        onClose={() => setRevokeModalOpen(false)}
        title="Revoke Secondary Author Permissions"
        subtitle={`Deauthorize ${selectedAuthor?.name} (${selectedAuthor?.walletAddress.slice(0, 6)}...${selectedAuthor?.walletAddress.slice(-4)}).`}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 space-y-1">
            <span className="font-bold flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Permission Revocation Notice</span>
            </span>
            <p className="leading-relaxed">
              Deauthorizing this Secondary Author immediately halts their document registration privileges. Previously registered documents remain intact in the permanent registry.
            </p>
          </div>

          <Textarea
            label="Revocation Justification (Optional)"
            placeholder="e.g. License expiration, retirement, transfer to another district office..."
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            rows={3}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setRevokeModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary-app"
              size="md"
              loading={isProcessing}
              onClick={handleDeauthorizeConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Confirm Deauthorization
            </Button>
          </div>
        </div>
      </Modal>

    </AppShell>
  );
};
