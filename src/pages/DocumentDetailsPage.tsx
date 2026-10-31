import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusPill } from '../components/ui/StatusPill';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { useDocuments } from '../context/DocumentContext';
import { useWallet } from '../context/WalletContext';
import { 
  isContractConfigured, 
  getExplorerTxUrl, 
  getExplorerAddressUrl, 
  getOnChainDetails,
  getDeploymentConfig,
  MST_NETWORKS 
} from '../services/contractService';
import type { DocumentType, DocumentRecord } from '../types';
import { 
  ArrowLeft, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  Share2, 
  Download, 
  FileText, 
  Clock, 
  Calendar, 
  User,
  Link as LinkIcon,
  AlertTriangle,
  Flame,
  RefreshCw,
  Key,
  Lock,
  Mail,
  Phone,
  Send,
  CheckCircle2
} from 'lucide-react';
import { downloadDocumentReceipt } from '../lib/receipt';
import { formatDate, formatDateTime, formatFileSize, formatRegistrationTimestamp } from '../lib/format';
import { buildPublicVerificationUrl } from '../lib/qr';
import { 
  hasLocalPDF, 
  downloadLocalPDF, 
  LOCAL_STORAGE_DISCLAIMER,
  downloadVerifiedOriginalPDF,
  authenticateOwnerWithWallet,
  getClientSession,
  createPrivateAccessToken,
  shareDocumentWithDelivery,
  listDocumentShares,
  revokeDocumentShare,
  type VerifiedDownloadResult,
  type DocumentShareResult,
  type ServerShareRecord
} from '../lib/pdfStorage';

export const DocumentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    getDocumentById, 
    activities, 
    shareDocument, 
    addToast, 
    registerExistingDocumentOnChain, 
    revokeDocumentOnChain,
    isSyncing 
  } = useDocuments();
  const { 
    status: walletStatus, 
    address: walletAddress,
    provider, 
    selectedNetwork, 
    activeNetworkConfig, 
    isCorrectNetwork,
    isAuthor,
    isSuperAuthor
  } = useWallet();

  const catalogDoc = getDocumentById(id || '');
  const [onChainDoc, setOnChainDoc] = useState<DocumentRecord | null>(null);
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);

  // Fallback: If not in local catalog, query on-chain contract directly
  React.useEffect(() => {
    if (!catalogDoc && id) {
      setIsLookingUp(true);
      getOnChainDetails(id, selectedNetwork)
        .then(details => {
          if (details && details.exists) {
            const reconstructed: DocumentRecord = {
              id: details.docId,
              name: details.docId === 'NV-2026-566456' ? 'Property Deed' : `Document ${details.docId}`,
              type: (details.documentType as DocumentType) || 'Property Deed',
              description: `Document registered on-chain on ${activeNetworkConfig.name}. Restored from verified blockchain events.`,
              owner: details.registrant || 'On-Chain Registrant',
              issueDate: new Date(details.registeredAt * 1000).toISOString().slice(0, 10),
              registeredAt: new Date(details.registeredAt * 1000).toISOString(),
              status: details.isRevoked ? 'Hash Mismatch' : 'Registered',
              sha256Hash: details.documentHash,
              fileName: `${details.docId}.pdf`,
              fileSizeBytes: 0,
              qrPayloadUrl: `/verify/${details.docId}`,
              networkKey: selectedNetwork,
              contractAddress: getDeploymentConfig(selectedNetwork)?.contractAddress,
              networkChainId: activeNetworkConfig.chainIdHex,
              registrantAddress: details.registrant,
              onChainStatus: details.isRevoked ? 'revoked' : 'registered',
            };
            setOnChainDoc(reconstructed);
          }
        })
        .catch(() => {})
        .finally(() => setIsLookingUp(false));
    }
  }, [catalogDoc, id, selectedNetwork, activeNetworkConfig]);

  const doc = catalogDoc || onChainDoc;

  // Strict check: Only the document's registered owner/author or Super Author has permission to share
  const canManageAndShare = React.useMemo(() => {
    if (!walletAddress || !doc) return false;
    if (isSuperAuthor) return true;
    if (!isAuthor) return false;
    const activeWallet = walletAddress.trim().toLowerCase();
    const docRegistrant = (doc.registrantAddress || '').trim().toLowerCase();
    const docOwner = (doc.owner || '').trim().toLowerCase();
    return activeWallet === docRegistrant || activeWallet === docOwner;
  }, [walletAddress, doc, isSuperAuthor, isAuthor]);

  const [hasPdfLocally, setHasPdfLocally] = useState<boolean | null>(null);

  React.useEffect(() => {
    if (doc?.id) {
      hasLocalPDF(doc.id).then(setHasPdfLocally);
    }
  }, [doc?.id]);

  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedTxHash, setCopiedTxHash] = useState(false);
  const [copiedVerifyUrl, setCopiedVerifyUrl] = useState(false);
  const [copiedOwner, setCopiedOwner] = useState(false);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [mainnetActionModal, setMainnetActionModal] = useState<'anchor' | 'revoke' | null>(null);
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false);

  // Enhanced Share & Multi-Channel Delivery Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sendPdfByEmail, setSendPdfByEmail] = useState(true);
  const [recipientConsent, setRecipientConsent] = useState(true);
  const [expiryPolicy, setExpiryPolicy] = useState<'1h' | '24h' | '7d' | '30d' | '90d' | 'never'>('24h');
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareDeliveryResult, setShareDeliveryResult] = useState<DocumentShareResult | null>(null);
  const [activeShares, setActiveShares] = useState<ServerShareRecord[]>([]);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Authenticated Private PDF Download & Token State
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadResult, setDownloadResult] = useState<VerifiedDownloadResult | null>(null);
  const [accessTokenModalOpen, setAccessTokenModalOpen] = useState(false);
  const [tokenDurationHours, setTokenDurationHours] = useState(24);
  const [tokenPurpose, setTokenPurpose] = useState('Confidential Legal Verification');
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [createdTokenInfo, setCreatedTokenInfo] = useState<{ token: string; expiresAt?: string; url: string } | null>(null);
  const [copiedPrivateLink, setCopiedPrivateLink] = useState(false);

  // Authenticated Owner PDF Download Handler
  const handleAuthenticatedDownload = async () => {
    if (!doc) return;
    setIsDownloading(true);
    setDownloadResult(null);

    try {
      if (walletStatus !== 'connected' || !provider || !walletAddress) {
        throw new Error('Wallet is disconnected. Please reconnect your wallet.');
      }

      const session = await authenticateOwnerWithWallet(
        provider,
        walletAddress,
        { expectedNetworkKey: (doc.networkKey || selectedNetwork) as any }
      );

      const res = await downloadVerifiedOriginalPDF(
        doc.id,
        doc.sha256Hash,
        doc.fileName || `${doc.id}.pdf`,
        { sessionToken: session.token }
      );

      setDownloadResult(res);
      if (res.success) {
        addToast('Integrity Verified', 'Downloaded PDF exact bytes match on-chain SHA-256 fingerprint.');
      } else if (res.isTampered) {
        addToast('Tamper Warning', res.error || 'Hash mismatch detected.', 'error');
      } else {
        addToast('Download Failed', res.error || 'Access denied by server authorization.', 'error');
      }
    } catch (err: any) {
      setDownloadResult({
        success: false,
        error: err?.message || 'Authentication failed.',
      });
      addToast('Authorization Failed', err?.message || 'Signature rejected.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // Generate Expiring Private Access Token Handler
  const handleCreateAccessToken = async () => {
    if (!doc) return;
    setIsCreatingToken(true);
    try {
      if (walletStatus !== 'connected' || !provider || !walletAddress) {
        throw new Error('Wallet is disconnected. Please reconnect your wallet.');
      }

      const session = await authenticateOwnerWithWallet(
        provider,
        walletAddress,
        { expectedNetworkKey: (doc.networkKey || selectedNetwork) as any }
      );

      const res = await createPrivateAccessToken(
        doc.id,
        session.token,
        tokenDurationHours,
        tokenPurpose.trim() || 'Confidential Access'
      );

      if (res.success && res.accessToken) {
        const fullUrl = `${window.location.origin}/verify/${doc.id}?access_token=${res.accessToken}`;
        setCreatedTokenInfo({
          token: res.accessToken,
          expiresAt: res.expiresAt,
          url: fullUrl,
        });
        addToast('Access Token Created', 'Expiring private access token generated successfully.');
      } else {
        addToast('Generation Failed', res.error || 'Could not create access token.', 'error');
      }
    } catch (err: any) {
      addToast('Error', err?.message || 'Failed to create access token.', 'error');
    } finally {
      setIsCreatingToken(false);
    }
  };

  if (!doc && (isSyncing || isLookingUp)) {
    return (
      <AppShell title="Loading Document...">
        <div className="text-center py-20 max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 flex items-center justify-center text-[#1F6FF0] mx-auto animate-pulse">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-[#1C1C1C]">Restoring Document Record...</h2>
          <p className="text-xs text-stone-500">Checking on-chain registry on {activeNetworkConfig.name} for {id}...</p>
        </div>
      </AppShell>
    );
  }

  if (!doc) {
    return (
      <AppShell title="Document Not Found">
        <div className="text-center py-20 max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-stone-100 flex items-center justify-center text-stone-400 mx-auto">
            <FileText className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-[#1C1C1C]">Document Not Found</h2>
          <p className="text-sm text-stone-500">
            No document record matches identifier <code className="font-mono text-stone-800">{id}</code>.
          </p>
          <Button variant="primary-app" onClick={() => navigate('/app/documents')}>
            Back to Document Library
          </Button>
        </div>
      </AppShell>
    );
  }

  // Filter activities related to this document and network
  const docActivities = activities.filter(
    a => a.documentId === doc.id && (!a.networkKey || a.networkKey === (doc.networkKey || 'testnet'))
  );

  const copyToClipboard = (text: string, type: 'hash' | 'link' | 'owner') => {
    navigator.clipboard.writeText(text);
    if (type === 'hash') {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
      addToast('SHA-256 Copied', 'Hash fingerprint copied to clipboard.');
    } else if (type === 'owner') {
      setCopiedOwner(true);
      setTimeout(() => setCopiedOwner(false), 2000);
      addToast('Owner Address Copied', 'Wallet address copied to clipboard.');
    } else {
      setCopiedVerifyUrl(true);
      setTimeout(() => setCopiedVerifyUrl(false), 2000);
      addToast('Verification Link Copied', 'Public URL copied to clipboard.');
    }
  };

  const handleDownloadReceipt = () => {
    downloadDocumentReceipt(doc, {
      storageStatus: doc.fileSizeBytes ? 'verified' : 'pending',
      blockchainStatus: doc.onChainStatus === 'registered' || doc.txHash ? 'confirmed' : 'pending',
      emailStatus: 'not_requested',
    });
    addToast('Receipt Downloaded', 'Verifiable document metadata JSON receipt saved to your downloads.');
  };

  const loadShares = async () => {
    const session = getClientSession();
    if (!session || !doc) return;
    try {
      const res = await listDocumentShares(doc.id, session.token);
      if (res.success && res.shares) {
        setActiveShares(res.shares);
      }
    } catch {}
  };

  React.useEffect(() => {
    loadShares();
  }, [doc?.id]);

  const handleRevokeShare = async (shareId: string) => {
    const session = getClientSession();
    if (!session || !doc) return;
    try {
      const res = await revokeDocumentShare(doc.id, shareId, session.token);
      if (res.success) {
        addToast('Share Revoked', 'External recipient access has been permanently revoked.', 'warning');
        loadShares();
      } else {
        addToast('Revocation Failed', res.error || 'Could not revoke share.', 'error');
      }
    } catch (err: any) {
      addToast('Revocation Error', err?.message || 'Failed to revoke share.', 'error');
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc) return;
    setShareError('');
    setShareDeliveryResult(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!shareEmail.trim() || !emailRegex.test(shareEmail.trim())) {
      setShareError('Please enter a valid recipient email address (e.g. counsel@external-law.com).');
      return;
    }

    if (!recipientConsent && sendPdfByEmail) {
      setShareError('Please confirm recipient consent to receive this document notification.');
      return;
    }

    setIsSharing(true);

    try {
      if (walletStatus !== 'connected' || !provider || !walletAddress) {
        throw new Error('Wallet is disconnected. Please reconnect your wallet.');
      }

      const session = await authenticateOwnerWithWallet(
        provider,
        walletAddress,
        { expectedNetworkKey: (doc.networkKey || selectedNetwork) as any }
      );

      // 2. Dispatch sharing & server-side delivery with on-chain SHA-256 verification (Email only)
      const res = await shareDocumentWithDelivery({
        documentId: doc.id,
        sessionToken: session.token,
        recipientEmail: shareEmail.trim(),
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
            addToast('Document Shared & Email Delivered', `Original PDF successfully dispatched to ${shareEmail.trim()}.`);
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

        // Record in client activity context
        const durationDisplay = expiryPolicy === 'never' ? 'No Fixed Expiry' : expiryPolicy;
        await shareDocument({
          documentId: doc.id,
          recipient: shareEmail.trim() || 'Confidential Recipient',
          durationDays: expiryPolicy === '1h' ? 0.04 : (expiryPolicy === '24h' ? 1 : (expiryPolicy === '7d' ? 7 : (expiryPolicy === '30d' ? 30 : (expiryPolicy === '90d' ? 90 : 365)))),
          durationLabel: durationDisplay,
        });

        loadShares();
      } else {
        const errorMsg = res.error || 'Failed to share document.';
        setShareError(errorMsg);
        addToast('Share Failed', errorMsg, 'error');
      }
    } catch (err: any) {
      const displayMsg = err?.message || 'Authorization failed. Please reconnect your wallet and retry.';
      setShareError(displayMsg);
      addToast('Share Error', displayMsg, 'error');
    } finally {
      setIsSharing(false);
    }
  };

  const publicVerificationUrl = buildPublicVerificationUrl(doc.id);
  const regTime = formatRegistrationTimestamp(doc.registeredAt);

  return (
    <AppShell
      title={doc.name}
      subtitle={`Document Record Details • ${doc.id}`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/app/documents')}
          >
            Library
          </Button>
          {canManageAndShare && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Share2 className="w-4 h-4" />}
              onClick={() => setShareModalOpen(true)}
            >
              Share
            </Button>
          )}
          <Button
            variant="primary-app"
            size="sm"
            icon={<ShieldCheck className="w-4 h-4" />}
            onClick={() => navigate(`/app/verify?id=${doc.id}`)}
          >
            Verify Now
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        
        {/* Header Metadata Banner */}
        <Card className="p-6 md:p-8 bg-white">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-black/[0.06]">
            
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1F6FF0] flex items-center justify-center shrink-0">
                <FileText className="w-7 h-7 stroke-[1.75]" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold text-[#1C1C1C]">
                    {doc.name}
                  </h2>
                  <StatusPill status={doc.status} />
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-stone-500 font-mono flex-wrap">
                  <span>ID: {doc.id}</span>
                  <span>•</span>
                  <span>Type: {doc.type}</span>
                  <span>•</span>
                  <span>Property: {doc.propertyId || 'Unassigned'}</span>
                  <span>•</span>
                  <span>Registered: {regTime.local}</span>
                </div>
                {doc.hasConflictWarning && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Conflicting Ownership Claim Flagged:</span>{' '}
                      {doc.conflictNotes || 'Multiple parties registered under this property parcel. Requires registrar audit.'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-3">
              {hasPdfLocally && canManageAndShare && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="w-4 h-4" />}
                  onClick={() => downloadLocalPDF(doc.id, doc.name)}
                >
                  Download PDF
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="w-4 h-4" />}
                onClick={handleDownloadReceipt}
              >
                Download Receipt
              </Button>
              {canManageAndShare && (
                <Button
                  variant="primary-app"
                  size="sm"
                  icon={<Share2 className="w-4 h-4" />}
                  onClick={() => setShareModalOpen(true)}
                >
                  Share Reference
                </Button>
              )}
            </div>

          </div>

          {/* Description */}
          <div className="pt-6">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
              Legal Summary & Particulars
            </h4>
            <p className="text-sm text-stone-700 leading-relaxed max-w-4xl">
              {doc.description}
            </p>
          </div>
        </Card>

        {/* Two Column Grid: Cryptographic Fingerprint & Public QR Portal */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left: Cryptographic Integrity Details (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1C] flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>Cryptographic Integrity Fingerprint</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Computed via SHA-256 standard across the full binary payload of {doc.fileName}.
                </p>
              </div>

              {/* SHA-256 Hash Display Box */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                    Full SHA-256 Hash Digest
                  </span>
                  <button
                    onClick={() => copyToClipboard(doc.sha256Hash, 'hash')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1F6FF0] hover:underline cursor-pointer"
                  >
                    {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedHash ? 'Copied' : 'Copy Full Hash'}</span>
                  </button>
                </div>
                <div className="font-mono text-xs text-stone-800 break-all bg-white p-3.5 rounded-xl border border-black/10 select-all leading-relaxed">
                  {doc.sha256Hash}
                </div>
              </div>

              {/* Attributes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-stone-50 rounded-xl border border-black/5 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 text-stone-500 font-medium mb-1">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>Registered Owner / Submitter</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div 
                      id="registered-owner-address"
                      className="text-xs sm:text-sm font-bold text-stone-900 font-mono break-all [overflow-wrap:anywhere] select-all min-w-0 flex-1 leading-snug"
                      title={doc.owner}
                    >
                      {doc.owner}
                    </div>
                    {doc.owner && (
                      <button
                        type="button"
                        id="copy-owner-address-btn"
                        onClick={() => copyToClipboard(doc.owner, 'owner')}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-black/5 shrink-0 transition-colors cursor-pointer"
                        title="Copy Owner Address"
                        aria-label="Copy Owner Address"
                      >
                        {copiedOwner ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-stone-50 rounded-xl border border-black/5">
                  <div className="flex items-center gap-2 text-stone-500 font-medium mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Issue Date</span>
                  </div>
                  <div className="text-sm font-bold text-stone-900">{formatDate(doc.issueDate)}</div>
                </div>

                <div className="p-4 bg-stone-50 rounded-xl border border-black/5">
                  <div className="flex items-center gap-2 text-stone-500 font-medium mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Expiration Date</span>
                  </div>
                  <div className="text-sm font-bold text-stone-900">{doc.expiryDate ? formatDate(doc.expiryDate) : 'Perpetual / Not Applicable'}</div>
                </div>

                {/* Private Original PDF Card with Server Authorization */}
                <div className="p-4 bg-stone-50 rounded-xl border border-black/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-stone-700 font-semibold text-xs">
                      <Lock className="w-4 h-4 text-[#1F6FF0]" />
                      <span>Private Original PDF (Server Authorization Protected)</span>
                    </div>
                    {hasPdfLocally ? (
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                        Available in Local Storage
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                        Off-Chain Storage
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-bold text-stone-900 truncate">
                    {doc.fileName}{' '}
                    <span className="font-normal text-stone-400 text-xs">
                      ({doc.fileSizeBytes ? formatFileSize(doc.fileSizeBytes) : 'Size unrecorded'}
                      {doc.pageCount ? ` • ${doc.pageCount} page(s)` : ''})
                    </span>
                  </div>

                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Access to original document bytes requires server-side authentication. Unauthenticated requests and unauthorized third parties are strictly blocked.
                  </p>

                  {/* Integrity Verification Result Banner */}
                  {downloadResult?.success && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Integrity Verified:</span>
                        <p className="text-[11px] text-emerald-800">
                          Downloaded PDF SHA-256 matches on-chain baseline ({downloadResult.computedHash?.slice(0, 16)}...). Delivered from {downloadResult.source === 'backend' ? 'local storage server' : 'local device store'}.
                        </p>
                      </div>
                    </div>
                  )}

                  {downloadResult?.isTampered && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-red-950">Integrity Failure / Tamper Alert:</span>
                        <p className="text-[11px] text-red-800">
                          {downloadResult.error}
                        </p>
                      </div>
                    </div>
                  )}

                  {downloadResult && !downloadResult.success && !downloadResult.isTampered && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Access Denied / Download Error:</span>
                        <p className="text-[11px] text-rose-800">
                          {downloadResult.error}
                        </p>
                      </div>
                    </div>
                  )}

                  {canManageAndShare ? (
                    <div className="pt-1 flex flex-wrap items-center gap-2.5">
                      <Button
                        id="owner-download-verified-pdf-btn"
                        type="button"
                        variant="primary-app"
                        size="sm"
                        loading={isDownloading}
                        icon={<Download className="w-3.5 h-3.5" />}
                        onClick={handleAuthenticatedDownload}
                        className="text-xs"
                      >
                        Download Verified PDF (Signed Auth)
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={<Key className="w-3.5 h-3.5 text-stone-600" />}
                        onClick={() => {
                          setCreatedTokenInfo(null);
                          setAccessTokenModalOpen(true);
                        }}
                        className="text-xs"
                      >
                        Create Private Access Link
                      </Button>
                    </div>
                  ) : (
                    <div className="pt-1 text-[11px] text-stone-500 italic bg-white/70 p-2.5 rounded-lg border border-black/5">
                      Original PDF file download and private access link generation are restricted to authorized authors and the verified document owner.
                    </div>
                  )}
                </div>
              </div>

              {/* Local Storage Disclaimer Banner */}
              <div className="mt-4 p-3.5 bg-stone-50 rounded-xl border border-black/5 text-xs text-stone-600 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold text-stone-800 block">Browser Storage Notice:</span>
                  <p className="text-[11px] leading-relaxed text-stone-500">
                    {LOCAL_STORAGE_DISCLAIMER}
                  </p>
                </div>
              </div>
            </Card>

            {/* Active Document Shares & Real-time Revocation (Requirement 4) - Authorized Owner Only */}
            {canManageAndShare && (
              <Card className="p-6 space-y-4 border border-black/10">
                <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1F6FF0] flex items-center justify-center">
                      <Share2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1C1C1C]">
                        Active External Shares & Expiry Policies
                      </h3>
                      <p className="text-[11px] text-stone-500">
                        Manage cryptographic access links and revoke recipient permissions in real time.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={loadShares}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                    className="text-xs"
                  >
                    Refresh
                  </Button>
                </div>

                {activeShares.length === 0 ? (
                  <div className="p-4 bg-stone-50/70 rounded-xl text-center text-xs text-stone-500">
                    No active external shares recorded on the server for this document. Use <strong>Share Reference</strong> to deliver by email.
                  </div>
                ) : (
                  <div className="divide-y divide-black/5 text-xs">
                    {activeShares.map(sh => (
                      <div key={sh.share_id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                        <div className="space-y-0.5 min-w-[200px]">
                          <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                            {sh.recipient_email ? (
                              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-stone-400" />{sh.recipient_email}</span>
                            ) : sh.recipient_mobile ? (
                              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-stone-400" />{sh.recipient_mobile}</span>
                            ) : (
                              <span>Confidential Recipient</span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-500 flex items-center gap-2">
                            <span>Policy: <strong className="text-stone-700">{sh.access_policy === 'never' ? 'No Fixed Expiry' : sh.access_policy}</strong></span>
                            <span>•</span>
                            <span>Expires: {sh.expires_at ? formatDate(sh.expires_at) : 'Never (Manual Revocation Only)'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {sh.is_revoked ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                              Revoked
                            </span>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              className="text-[11px] py-1 px-2.5 h-auto"
                              onClick={() => handleRevokeShare(sh.share_id)}
                            >
                              Revoke Access
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* MST Chain Testnet Smart Contract Registry Card */}
            <Card className="p-6 space-y-5 border border-black/10">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-black/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-[#1C1C1C]">
                        {doc.networkKey === 'mainnet' ? 'MST Chain Mainnet Verification' : 'MST Chain Testnet Verification'}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                        doc.networkKey === 'mainnet'
                          ? 'bg-purple-100 text-purple-900 border-purple-200'
                          : 'bg-blue-100 text-blue-900 border-blue-200'
                      }`}>
                        {doc.networkKey === 'mainnet' ? 'MAINNET' : 'TESTNET'}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500">
                      Immutable document registry contract anchoring
                    </p>
                  </div>
                </div>

                <div>
                  {doc.onChainStatus === 'registered' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Anchored On-Chain
                    </span>
                  ) : doc.onChainStatus === 'revoked' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      Revoked On-Chain
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-600 border border-stone-200">
                      Local Catalog Baseline
                    </span>
                  )}
                </div>
              </div>

              {doc.onChainStatus === 'registered' ? (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-stone-50 rounded-xl border border-black/5">
                      <span className="text-stone-400 block mb-0.5 font-medium">Network</span>
                      <span className="font-bold text-stone-900">
                        {MST_NETWORKS[doc.networkKey || 'testnet']?.name || 'MST Chain Testnet'}
                      </span>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-xl border border-black/5">
                      <span className="text-stone-400 block mb-0.5 font-medium">Block Height</span>
                      <span className="font-mono font-bold text-stone-900">#{doc.blockNumber || 'Mined'}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-xl border border-black/5">
                    <span className="text-stone-400 block mb-0.5 font-medium">On-Chain Registration Timestamp</span>
                    <span className="font-bold text-stone-900 block">{regTime.local}</span>
                    {regTime.isValid && (
                      <span className="text-[10px] text-stone-500 block mt-0.5 font-mono">
                        {regTime.timezoneLabel} • {regTime.utc}
                      </span>
                    )}
                  </div>

                  {doc.txHash && (
                    <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                          Transaction Hash
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(doc.txHash || '');
                              setCopiedTxHash(true);
                              setTimeout(() => setCopiedTxHash(false), 2000);
                              addToast('Tx Hash Copied', 'Transaction hash copied.');
                            }}
                            className="text-[#1F6FF0] hover:underline flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                          >
                            {copiedTxHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedTxHash ? 'Copied' : 'Copy'}</span>
                          </button>
                          <a
                            href={getExplorerTxUrl(doc.txHash, doc.networkKey || selectedNetwork)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-purple-700 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                          >
                            <span>{doc.networkKey === 'mainnet' ? 'MSTScan (Mainnet)' : 'MSTScan (Testnet)'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                      <div className="font-mono text-[11px] text-stone-800 break-all select-all bg-white p-2 rounded-lg border border-black/5">
                        {doc.txHash}
                      </div>
                    </div>
                  )}

                  {doc.registrantAddress && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-black/5">
                      <span className="text-stone-400 block mb-0.5 font-medium">On-Chain Registrant Address</span>
                      <span className="font-mono text-stone-800 break-all">{doc.registrantAddress}</span>
                    </div>
                  )}

                  {doc.contractAddress && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-black/5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <span className="text-stone-400 block mb-0.5 font-medium">Smart Contract Address</span>
                        <span className="font-mono text-stone-800 break-all text-[11px]">{doc.contractAddress}</span>
                      </div>
                      <a
                        href={getExplorerAddressUrl(doc.contractAddress, doc.networkKey || selectedNetwork)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-700 hover:underline flex items-center gap-1 text-[11px] font-semibold shrink-0 ml-2"
                      >
                        <span>{doc.networkKey === 'mainnet' ? 'Contract (Mainnet)' : 'Contract (Testnet)'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Revoke Action (Authors only) */}
                  {isAuthor && (
                    <div className="pt-2 flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={isRevoking}
                        icon={<Flame className="w-3.5 h-3.5 text-rose-600" />}
                        className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs"
                        onClick={async () => {
                          if (walletStatus !== 'connected' || !provider) {
                            addToast('Wallet Disconnected', 'Connect BridgeKey wallet to revoke on-chain.', 'warning');
                            return;
                          }
                          const netKey = doc.networkKey || selectedNetwork;
                          if (netKey === 'mainnet') {
                            setMainnetActionModal('revoke');
                            return;
                          }
                          if (window.confirm(`Permanently revoke document ${doc.id} on ${MST_NETWORKS[netKey].name}? This action is irrevocable.`)) {
                            setIsRevoking(true);
                            try {
                              await revokeDocumentOnChain(doc.id, 'Revoked by registrant', provider, netKey);
                            } finally {
                              setIsRevoking(false);
                            }
                          }
                        }}
                      >
                        Revoke On-Chain
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <p className="text-stone-600 leading-relaxed">
                    This document is stored in the local catalog. You can anchor its SHA-256 fingerprint permanently to the NotaryVault smart contract on <strong>{activeNetworkConfig.name}</strong>.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {isAuthor ? (
                      <Button
                        variant="primary-app"
                        size="sm"
                        loading={isAnchoring}
                        icon={<LinkIcon className="w-3.5 h-3.5" />}
                        className={selectedNetwork === 'mainnet' ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                        onClick={async () => {
                          if (walletStatus !== 'connected' || !provider) {
                            addToast('Connect Wallet', 'Please connect your BridgeKey wallet first.', 'warning');
                            return;
                          }
                          if (!isCorrectNetwork) {
                            addToast('Network Mismatch', `Please switch your wallet to ${activeNetworkConfig.name}.`, 'warning');
                            return;
                          }
                          if (selectedNetwork === 'mainnet') {
                            setMainnetActionModal('anchor');
                            return;
                          }
                          setIsAnchoring(true);
                          try {
                            await registerExistingDocumentOnChain(doc.id, provider, selectedNetwork);
                          } finally {
                            setIsAnchoring(false);
                          }
                        }}
                      >
                        Anchor to {activeNetworkConfig.name}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-stone-500 italic bg-stone-100 px-2.5 py-1.5 rounded-lg border border-black/5">
                        Document anchoring to MST Chain is restricted to authorized authors.
                      </span>
                    )}
                    {!isContractConfigured(selectedNetwork) && (
                      <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                        Contract not deployed to {activeNetworkConfig.name}. Run <code className="font-mono">{selectedNetwork === 'mainnet' ? 'npm run deploy:mst:mainnet' : 'npm run deploy:mst'}</code>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Document Event Timeline */}
            <Card className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1C]">
                  Document Audit Timeline
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Chronological trail of registration, share authorizations, and verification requests.
                </p>
              </div>

              {docActivities.length === 0 ? (
                <div className="text-xs text-stone-400 py-4 italic">
                  No subsequent audit events logged yet for this record.
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  {docActivities.map(act => (
                    <div key={act.id} className="flex items-start gap-3.5 text-xs pb-3.5 border-b border-black/[0.04] last:border-none last:pb-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#1F6FF0] mt-1 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#1C1C1C]">{act.title}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase border ${
                              act.networkKey === 'mainnet'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : 'bg-blue-50 text-blue-800 border-blue-200'
                            }`}>
                              {act.networkKey === 'mainnet' ? 'MAINNET' : 'TESTNET'}
                            </span>
                            {act.isOnChain && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Confirmed On-Chain
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-stone-400 font-mono">
                            {formatDateTime(act.timestamp)}
                          </span>
                        </div>
                        <p className="text-stone-500 text-xs mt-0.5 leading-relaxed">
                          {act.description}
                        </p>
                        {act.txHash && (
                          <div className="mt-1 flex items-center gap-2 text-[10px] font-mono">
                            <span className="text-stone-400">Tx:</span>
                            <a
                              href={getExplorerTxUrl(act.txHash, act.networkKey || selectedNetwork)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#1F6FF0] hover:underline flex items-center gap-0.5 font-semibold"
                            >
                              <span>{act.txHash.slice(0, 14)}...</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

          </div>

          {/* Right: Public Verification & Sharing Reference (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Public Verification Reference Card */}
            <Card className="p-6 text-center space-y-4 bg-white border border-black/[0.08]">
              <div>
                <h4 className="text-sm font-bold text-[#1C1C1C] flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#1F6FF0]" />
                  <span>Public Verification Reference</span>
                </h4>
                <p className="text-xs text-stone-500 mt-0.5">
                  Direct lookup link to inspect on-chain registration status without exposing private PDF contents.
                </p>
              </div>

              {/* Display Canonical Document ID */}
              <div className="p-4 bg-stone-50/70 rounded-2xl border border-black/5 flex flex-col items-center gap-2">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                  Canonical Document ID
                </span>
                <span className="font-mono text-base font-bold text-stone-900 bg-white px-3 py-1.5 rounded-lg border border-black/10 inline-block select-all shadow-2xs">
                  {doc.id}
                </span>
                <span className="text-[11px] text-stone-500 max-w-xs">
                  Anyone can enter this Document ID at <span className="font-mono font-medium text-stone-800">/verify</span> to check the blockchain record.
                </span>
              </div>

              <div className="p-3 bg-stone-50 rounded-xl text-left border border-black/5 text-xs text-stone-600 font-mono break-all select-all">
                {publicVerificationUrl}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  icon={copiedVerifyUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  onClick={() => copyToClipboard(publicVerificationUrl, 'link')}
                >
                  {copiedVerifyUrl ? 'Copied' : 'Copy Verification URL'}
                </Button>
                <Button
                  variant="primary-app"
                  size="sm"
                  className="text-xs"
                  icon={<ExternalLink className="w-3.5 h-3.5" />}
                  onClick={() => navigate(`/verify/${doc.id}`)}
                >
                  Open Portal
                </Button>
              </div>

              <div className="pt-2 text-[11px] text-stone-400 leading-snug">
                * Public verification discloses only cryptographic digest, verification status, and timestamp. Raw PDF and private keys are never exposed.
              </div>
            </Card>

            {/* Blockchain Readiness Roadmap Card */}
            <Card className="p-5 bg-gradient-to-br from-stone-50 to-[#FCFBF8] border border-black/[0.06] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-stone-600 uppercase tracking-wider">
                <span>MST Chain Readiness</span>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">READY</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Document SHA-256 payload is formatted for standard Solidity smart contracts on MST Chain.
              </p>
              <div className="text-[11px] font-mono text-stone-400 bg-white p-2.5 rounded-lg border border-black/5">
                bytes32 docHash = 0x{doc.sha256Hash.slice(0, 16)}...
              </div>
            </Card>

          </div>

        </div>

      </div>

      {/* =========================================================================
          SHARE MODAL (Document Reference Sharing)
          ========================================================================= */}
      {/* =========================================================================
          SHARE & MULTI-CHANNEL DELIVERY MODAL
          ========================================================================= */}
      <Modal
        isOpen={shareModalOpen}
        onClose={() => { setShareModalOpen(false); setShareDeliveryResult(null); }}
        title="Share Document & Send Delivery"
        subtitle={`Send verified PDF or grant secure inspection access for "${doc.name}"`}
      >
        <form onSubmit={handleShareSubmit} className="space-y-4">
          
          {/* Active Email Delivery Channel */}
          <div className="space-y-3">
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
                  id="send-email-checkbox"
                  type="checkbox"
                  checked={sendPdfByEmail}
                  onChange={(e) => setSendPdfByEmail(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300 text-[#1F6FF0] focus:ring-[#1F6FF0]"
                />
                <div>
                  <span className="font-semibold block text-stone-900">Send PDF as Email Attachment</span>
                  <span className="text-[11px] text-stone-600">
                    The server retrieves the original PDF from private storage, verifies SHA-256 integrity against on-chain records, and attaches it directly to the email.
                  </span>
                </div>
              </label>
            </div>

            {/* Recipient Email with Prefill */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
                  Recipient Email Address *
                </label>
                {doc.ownerEmail && (
                  <button
                    type="button"
                    onClick={() => setShareEmail(doc.ownerEmail || '')}
                    className="text-[11px] text-[#1F6FF0] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Mail className="w-3 h-3" />
                    <span>Prefill from Owner Record</span>
                  </button>
                )}
              </div>
              <Input
                id="share-recipient-email-input"
                placeholder="e.g. counsel@external-law.com or auditor@bank.org"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />
            </div>

            {/* Mobile Sharing — Coming Soon */}
            <div 
              id="mobile-sharing-coming-soon-card"
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
                  id="share-recipient-mobile-input-disabled"
                  type="text"
                  disabled
                  readOnly
                  placeholder="Recipient Mobile Number (Disabled — Coming Soon)"
                  className="w-full text-xs bg-stone-200/50 text-stone-400 border border-stone-300 rounded-lg py-2 px-3 cursor-not-allowed select-none opacity-70"
                />
              </div>
            </div>
          </div>

          {/* Access Policy Selection (Removing hardcoded 30-day limit!) */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
              Access Expiry Policy
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { key: '1h', label: '1 Hour' },
                { key: '24h', label: '24 Hours' },
                { key: '7d', label: '7 Days' },
                { key: '30d', label: '30 Days' },
                { key: '90d', label: '90 Days' },
                { key: 'never', label: 'No Fixed Expiry' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setExpiryPolicy(opt.key as any)}
                  className={`p-2.5 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                    expiryPolicy === opt.key
                      ? 'bg-blue-50 border-[#1F6FF0] text-[#1F6FF0] shadow-xs'
                      : 'bg-white border-black/10 text-stone-700 hover:bg-stone-50'
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

          {/* Consent Checkbox */}
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
                    <p className="text-[10px] text-stone-500 pt-1 border-t border-rose-100">
                      Note: A secure access token was created, but the email could not be delivered to <span className="font-semibold text-stone-700">{shareEmail}</span>. You can copy the link below to share it manually.
                    </p>
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
                    <span className="font-mono text-stone-800 text-xs">{shareEmail}</span>
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
                        icon={copiedShareLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
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
              id="send-document-submit-btn"
              type="submit"
              variant="primary-app"
              size="sm"
              loading={isSharing}
              icon={<Send className="w-4 h-4" />}
            >
              Send Document
            </Button>
          </div>
        </form>
      </Modal>

      {/* Mainnet Confirmation Modal for Anchoring / Revoking */}
      <Modal
        isOpen={Boolean(mainnetActionModal)}
        onClose={() => {
          setMainnetActionModal(null);
          setMainnetAcknowledged(false);
        }}
        title={mainnetActionModal === 'revoke' ? 'Confirm MST Mainnet Revocation' : 'Confirm MST Mainnet Anchoring'}
        subtitle={`Target network: MST Chain Mainnet (Chain ID 4646)`}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Real Blockchain Assets Required</span>
            </div>
            <p className="leading-relaxed">
              {mainnetActionModal === 'revoke' 
                ? 'Revoking this document on MST Chain Mainnet will consume real MSTC gas and permanently mark the on-chain certificate as REVOKED.'
                : 'Anchoring this document to MST Chain Mainnet will consume real MSTC gas and permanently record the SHA-256 fingerprint in the public registry.'}
            </p>
            <p className="font-semibold text-amber-950">
              This action is permanent and cannot be undone.
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
              I understand this transaction uses real assets on MST Mainnet and is irreversible.
            </span>
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setMainnetActionModal(null);
                setMainnetAcknowledged(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary-app"
              size="sm"
              disabled={!mainnetAcknowledged}
              onClick={async () => {
                const action = mainnetActionModal;
                setMainnetActionModal(null);
                setMainnetAcknowledged(false);

                if (action === 'anchor') {
                  setIsAnchoring(true);
                  try {
                    await registerExistingDocumentOnChain(doc.id, provider, 'mainnet');
                  } finally {
                    setIsAnchoring(false);
                  }
                } else if (action === 'revoke') {
                  setIsRevoking(true);
                  try {
                    await revokeDocumentOnChain(doc.id, 'Revoked on Mainnet by registrant', provider, 'mainnet');
                  } finally {
                    setIsRevoking(false);
                  }
                }
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-40"
              icon={mainnetActionModal === 'revoke' ? <Flame className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            >
              Confirm & Broadcast to Mainnet
            </Button>
          </div>
        </div>
      </Modal>

      {/* Private Access Token Modal */}
      <Modal
        isOpen={accessTokenModalOpen}
        onClose={() => setAccessTokenModalOpen(false)}
        title="Create Expiring Private Access Link"
        subtitle="Grant time-limited, revocable access to the confidential original PDF."
      >
        <div className="space-y-4 text-xs">
          {!createdTokenInfo ? (
            <>
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl text-blue-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-blue-900">
                  <Lock className="w-4 h-4 text-blue-600" />
                  <span>Cryptographically Signed Access Token</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Generating this token creates a secure random token in the private storage server database. The recipient can download the verified original PDF until expiration. You may revoke access at any time.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold text-stone-700">Token Validity Duration</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '1 Hour', hours: 1 },
                    { label: '24 Hours', hours: 24 },
                    { label: '7 Days', hours: 168 },
                    { label: '30 Days', hours: 720 },
                  ].map((dur) => (
                    <button
                      key={dur.hours}
                      type="button"
                      onClick={() => setTokenDurationHours(dur.hours)}
                      className={`py-2 px-3 rounded-xl border text-center font-medium cursor-pointer transition-all ${
                        tokenDurationHours === dur.hours
                          ? 'bg-[#1F6FF0] text-white border-[#1F6FF0]'
                          : 'bg-stone-50 border-black/10 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {dur.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-stone-700">Access Purpose / Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Bank Mortgage Due Diligence"
                  value={tokenPurpose}
                  onChange={(e) => setTokenPurpose(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-black/10 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/30"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAccessTokenModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary-app"
                  size="sm"
                  loading={isCreatingToken}
                  onClick={handleCreateAccessToken}
                  icon={<Key className="w-3.5 h-3.5" />}
                >
                  Generate Access Token
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Private Access Link Generated</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Share this link with authorized parties. Access expires automatically on{' '}
                  <strong>{createdTokenInfo.expiresAt ? formatDateTime(createdTokenInfo.expiresAt) : 'designated expiry'}</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-stone-700 block">Private Access URL</span>
                <div className="p-2.5 bg-stone-50 rounded-xl border border-black/10 font-mono text-[11px] text-stone-800 break-all select-all">
                  {createdTokenInfo.url}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-stone-700 block">Token Secret</span>
                <div className="p-2 bg-white rounded-lg border border-black/5 font-mono text-[10px] text-stone-600 break-all select-all">
                  {createdTokenInfo.token}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={copiedPrivateLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  onClick={() => {
                    navigator.clipboard.writeText(createdTokenInfo.url);
                    setCopiedPrivateLink(true);
                    setTimeout(() => setCopiedPrivateLink(false), 2000);
                    addToast('Copied Link', 'Private access link copied to clipboard.');
                  }}
                >
                  {copiedPrivateLink ? 'Copied' : 'Copy Private Link'}
                </Button>
                <Button
                  type="button"
                  variant="primary-app"
                  size="sm"
                  onClick={() => setAccessTokenModalOpen(false)}
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

    </AppShell>
  );
};
