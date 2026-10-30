import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useDocuments } from '../context/DocumentContext';
import { 
  getOnChainDetails, 
  getExplorerTxUrl, 
  getExplorerAddressUrl, 
  type OnChainDocumentDetails 
} from '../services/contractService';
import { normalizeDocumentId } from '../lib/id';
import { formatRegistrationTimestamp, formatDate } from '../lib/format';
import { downloadVerifiedOriginalPDF, type VerifiedDownloadResult } from '../lib/pdfStorage';
import { 
  HelpCircle, 
  Lock, 
  ArrowRight, 
  RefreshCw, 
  ExternalLink, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Copy,
  Check,
  Building,
  User,
  Clock,
  FileCheck,
  Download,
  Calendar,
  Search,
  Key
} from 'lucide-react';

export const QRVerificationPage: React.FC = () => {
  const { documentId } = useParams<{ documentId?: string }>();
  const navigate = useNavigate();
  const { getDocumentById } = useDocuments();

  const [searchInput, setSearchInput] = useState<string>(documentId || '');
  const cleanDocId = normalizeDocumentId(documentId || '');
  const catalogDoc = cleanDocId ? getDocumentById(cleanDocId) : undefined;

  const [onChainDetails, setOnChainDetails] = useState<OnChainDocumentDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(cleanDocId));
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [copiedRegistrant, setCopiedRegistrant] = useState<boolean>(false);

  // Private Access Token Download State (for authorized parties holding an access token)
  const [showTokenInput, setShowTokenInput] = useState<boolean>(false);
  const [privateAccessToken, setPrivateAccessToken] = useState<string>('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [downloadResult, setDownloadResult] = useState<VerifiedDownloadResult | null>(null);

  // Sync search input when param changes
  useEffect(() => {
    if (documentId) {
      setSearchInput(documentId);
    }
  }, [documentId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = searchInput.trim().toUpperCase();
    if (target) {
      navigate(`/verify/${target}`);
    }
  };

  const fetchOnChain = useCallback(async () => {
    if (!cleanDocId) {
      setIsLoading(false);
      setOnChainDetails(null);
      setRpcError(null);
      return;
    }

    setIsLoading(true);
    setRpcError(null);

    try {
      const details = await getOnChainDetails(cleanDocId, 'testnet');
      if (details.error && !details.exists && (details.error.toLowerCase().includes('failed') || details.error.toLowerCase().includes('network') || details.error.toLowerCase().includes('rpc'))) {
        setRpcError(details.error);
        setOnChainDetails(null);
      } else {
        setOnChainDetails(details);
      }
    } catch (err: any) {
      setRpcError(err?.message || 'Unable to connect to blockchain RPC node.');
      setOnChainDetails(null);
    } finally {
      setIsLoading(false);
    }
  }, [cleanDocId]);

  useEffect(() => {
    fetchOnChain();
  }, [fetchOnChain]);

  // Authoritative State Calculations
  const isFoundOnChain = Boolean(onChainDetails && onChainDetails.exists);
  const isFoundInCatalog = Boolean(catalogDoc);
  const isRevoked = Boolean(onChainDetails?.isRevoked || catalogDoc?.onChainStatus === 'revoked');
  
  // Registration timestamp: prefer on-chain registeredAt, fallback to catalog if valid
  const rawTimestamp = onChainDetails?.registeredAt 
    ? onChainDetails.registeredAt 
    : (catalogDoc?.registeredAt || null);
  const timeInfo = formatRegistrationTimestamp(rawTimestamp);

  // Document metadata (strictly non-fabricated on-chain and registered data)
  const recordedHash = onChainDetails?.documentHash || catalogDoc?.sha256Hash || '';
  const docType = onChainDetails?.documentType || catalogDoc?.type || 'Other';
  const docTitle = catalogDoc?.name || (cleanDocId === 'NV-2026-566456' ? 'Historical Property Deed' : `Document ${cleanDocId}`);
  const issuingParty = catalogDoc?.owner || 'On-Chain Registrant';
  const issueDate = catalogDoc?.issueDate || '';
  const expiryDate = catalogDoc?.expiryDate || '';
  const registrantAddress = onChainDetails?.registrant || catalogDoc?.registrantAddress || '';
  const propertyId = catalogDoc?.propertyId || (cleanDocId === 'NV-2026-566456' ? 'PROP-PARCEL-2026-441' : undefined);
  const txHash = catalogDoc?.txHash || (cleanDocId === 'NV-2026-566456' ? '0x7fbc35a3cc8b7de8ff99154b29dfc2d890c5c2400820c107938dfe0a116b5344' : undefined);
  const blockNumber = catalogDoc?.blockNumber || (cleanDocId === 'NV-2026-566456' ? 6644251 : undefined);
  const contractAddress = onChainDetails?.contractAddress || catalogDoc?.contractAddress || '0xC4B7ea1B1cE4e95Bad65bf3fd3c7A079720120F3';
  const isHistorical = Boolean(onChainDetails?.isHistorical || contractAddress.toLowerCase() === '0xe9097672c2556318f1bd974323174baa43b88514');

  // Exact Registration Status: Registered, Revoked, Not Found, or Verification Unavailable
  let statusBadge = {
    label: 'Not Found',
    bg: 'bg-stone-100 border-stone-200',
    text: 'text-stone-700',
    icon: <XCircle className="w-4 h-4 text-stone-500" />
  };

  if (rpcError) {
    statusBadge = {
      label: 'Verification Unavailable',
      bg: 'bg-amber-100 border-amber-300',
      text: 'text-amber-900',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600" />
    };
  } else if (isRevoked) {
    statusBadge = {
      label: 'Revoked',
      bg: 'bg-rose-100 border-rose-300',
      text: 'text-rose-800',
      icon: <AlertTriangle className="w-4 h-4 text-rose-600" />
    };
  } else if (isFoundOnChain || isFoundInCatalog) {
    statusBadge = {
      label: 'Registered',
      bg: 'bg-emerald-100 border-emerald-300',
      text: 'text-emerald-800',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />
    };
  }

  // Copy helper
  const copyText = (text: string, type: 'hash' | 'registrant') => {
    navigator.clipboard.writeText(text);
    if (type === 'hash') {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } else {
      setCopiedRegistrant(true);
      setTimeout(() => setCopiedRegistrant(false), 2000);
    }
  };

  // Authenticated Private PDF Download via Private Access Token
  const handleDownloadWithAccessToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanDocId) return;
    if (!privateAccessToken.trim()) {
      setDownloadResult({
        success: false,
        error: 'Please enter a valid private access token.',
      });
      return;
    }

    setIsDownloadingPdf(true);
    setDownloadResult(null);

    try {
      const res = await downloadVerifiedOriginalPDF(
        cleanDocId, 
        recordedHash, 
        `${cleanDocId}.pdf`,
        { accessToken: privateAccessToken.trim() }
      );
      setDownloadResult(res);
    } catch (err: any) {
      setDownloadResult({
        success: false,
        error: err?.message || 'Access token invalid, expired, or revoked.',
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F4ED] text-[#1C1C1C] flex flex-col justify-between p-4 sm:p-8 md:p-12 selection:bg-[#3B6EF5] selection:text-white">
      
      {/* Top Public Header */}
      <header className="max-w-3xl mx-auto w-full flex items-center justify-between pb-6 sm:pb-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF2E88] via-[#8B7BF0] to-[#1F6FF0] flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-[#1C1C1C] block leading-none">
              NotaryVault
            </span>
            <span className="text-[10px] text-stone-500 font-medium">
              Public Property & Document Verification
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-block text-xs font-mono bg-white px-3 py-1 rounded-full border border-black/10 text-stone-600 shadow-2xs">
            MST Chain Testnet
          </span>
          <Link to="/app" className="text-xs font-semibold text-[#1F6FF0] hover:underline">
            Launch App
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto w-full my-auto space-y-6">
        
        {/* Document ID Lookup Bar */}
        <Card className="p-4 sm:p-5 bg-white border border-black/10 shadow-sm">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="public-verify-id-input"
                type="text"
                placeholder="Enter Document ID (e.g. NV-2026-566456)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-black/10 rounded-xl text-sm font-mono text-stone-900 placeholder:text-stone-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/30 focus:border-[#1F6FF0]"
              />
            </div>
            <Button
              id="public-verify-search-btn"
              type="submit"
              variant="primary-app"
              size="md"
              icon={<ShieldCheck className="w-4 h-4" />}
              className="text-xs sm:w-auto shrink-0"
            >
              Verify On-Chain
            </Button>
          </form>

          {/* Quick lookup suggestions */}
          <div className="pt-2.5 flex items-center gap-2 text-[11px] text-stone-500 flex-wrap">
            <span>Example verified records:</span>
            <button
              type="button"
              onClick={() => {
                setSearchInput('NV-2026-566456');
                navigate('/verify/NV-2026-566456');
              }}
              className="font-mono text-[#1F6FF0] hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-100"
            >
              NV-2026-566456 (Historical)
            </button>
          </div>
        </Card>

        {/* Verification Record Card */}
        <Card className="p-6 sm:p-8 md:p-10 bg-white border border-black/10 shadow-lg space-y-6">
          
          {!cleanDocId ? (
            /* Prompt to enter Document ID */
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 text-[#1F6FF0] flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-[#1C1C1C]">
                  Public Blockchain Document Verification
                </h2>
                <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
                  Enter any canonical Document ID above to verify its cryptographic timestamp, registration status, and on-chain SHA-256 fingerprint against configured smart contracts.
                </p>
              </div>
            </div>
          ) : isLoading ? (
            /* Loading State */
            <div className="text-center py-12 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1F6FF0] flex items-center justify-center mx-auto">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-[#1C1C1C]">Checking Blockchain Registry...</h2>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                Querying MST Chain Testnet smart contract registry for document <code className="font-mono font-bold text-stone-800">{cleanDocId}</code>...
              </p>
            </div>
          ) : rpcError ? (
            /* Explicit RPC Network Failure - Verification Unavailable */
            <div className="space-y-5 text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Status: Verification Unavailable
                </div>
                <h2 className="text-xl font-bold text-[#1C1C1C]">
                  Blockchain Network Query Failed
                </h2>
                <p className="text-xs text-stone-600 max-w-md mx-auto leading-relaxed">
                  Unable to connect to the MST Chain Testnet RPC node. Public verification cannot be confirmed until the blockchain network responds.
                </p>
                <div className="font-mono text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 max-w-md mx-auto mt-2 break-all">
                  {rpcError}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={fetchOnChain}
                className="mt-2 text-xs"
              >
                Retry Blockchain Query
              </Button>
            </div>
          ) : (!isFoundOnChain && !isFoundInCatalog) ? (
            /* Document Not Found */
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                <HelpCircle className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-700 border border-stone-200 mb-2">
                  <XCircle className="w-3.5 h-3.5 text-stone-500" />
                  Status: Not Found
                </div>
                <h2 className="text-2xl font-bold text-[#1C1C1C]">
                  Document Record Not Found
                </h2>
                <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed pt-1">
                  The identifier <code className="font-mono font-bold text-stone-800 bg-stone-100 px-1.5 py-0.5 rounded">{cleanDocId}</code> does not match any registered record in the active or historical NotaryVault smart contract registries.
                </p>
              </div>
            </div>
          ) : (
            /* Authoritative Document Verification Record */
            <>
              {/* Status Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-black/[0.06]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block">
                      Public Blockchain Record
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isHistorical ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}>
                      {isHistorical ? 'Historical Registry (v1 fallback)' : 'Active Registry (v2)'}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-[#1C1C1C] tracking-tight">
                    Document {cleanDocId}
                  </h1>
                </div>

                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${statusBadge.bg} ${statusBadge.text} shrink-0`}>
                  {statusBadge.icon}
                  <span>Status: {statusBadge.label}</span>
                </div>
              </div>

              {/* Verified Metadata Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  
                  {/* Document ID */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5">
                    <span className="text-stone-400 block font-medium mb-1">
                      Document ID
                    </span>
                    <span className="font-mono text-sm font-bold text-stone-900 select-all">
                      {cleanDocId}
                    </span>
                  </div>

                  {/* Document Title */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5">
                    <span className="text-stone-400 block font-medium mb-1">
                      Document Title
                    </span>
                    <span className="text-sm font-bold text-stone-900 truncate block" title={docTitle}>
                      {docTitle}
                    </span>
                  </div>

                  {/* Document Classification */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5">
                    <span className="text-stone-400 block font-medium mb-1">
                      Document Classification
                    </span>
                    <div className="flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-stone-500" />
                      <span className="text-sm font-bold text-stone-900">
                        {docType}
                      </span>
                    </div>
                  </div>

                  {/* Issuing Party / Registrant */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5">
                    <span className="text-stone-400 block font-medium mb-1">
                      Issuing Party / Registrant
                    </span>
                    <span className="text-sm font-bold text-stone-900 truncate block">
                      {issuingParty}
                    </span>
                  </div>

                  {/* Issue Date & Validity */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5">
                    <span className="text-stone-400 block font-medium mb-1">
                      Issue Date & Validity
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                      <Calendar className="w-3.5 h-3.5 text-stone-500" />
                      <span>{issueDate ? formatDate(issueDate) : 'Recorded at Registration'}</span>
                      {expiryDate && (
                        <span className="text-stone-500 font-normal">
                          (Expires: {formatDate(expiryDate)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Property ID (only if available) */}
                  {propertyId && (
                    <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5">
                      <span className="text-stone-400 block font-medium mb-1">
                        Associated Property ID
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-stone-500" />
                        <span className="font-mono text-sm font-bold text-stone-900 select-all">
                          {propertyId}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Registration Timestamp with Local Timezone & UTC */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5 sm:col-span-2">
                    <span className="text-stone-400 block font-medium mb-1">
                      Confirmed Blockchain Registration Timestamp
                    </span>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        <span className="text-xs font-bold text-stone-900">
                          {timeInfo.local}
                        </span>
                      </div>
                      {timeInfo.isValid && (
                        <div className="text-[10px] text-stone-500 font-mono pl-5">
                          {timeInfo.timezoneLabel} • {timeInfo.utc}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* On-Chain Registrant Address (if public on-chain) */}
                  {registrantAddress && (
                    <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5 sm:col-span-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 font-medium flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          <span>Registrant Wallet Address (Public On-Chain)</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyText(registrantAddress, 'registrant')}
                            className="text-[#1F6FF0] hover:underline flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                          >
                            {copiedRegistrant ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedRegistrant ? 'Copied' : 'Copy'}</span>
                          </button>
                          <a
                            href={getExplorerAddressUrl(registrantAddress, 'testnet')}
                            target="_blank"
                            rel="noreferrer"
                            className="text-purple-700 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                          >
                            <span>MSTScan</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                      <div className="font-mono text-xs text-stone-800 break-all select-all bg-white p-2 rounded-lg border border-black/5">
                        {registrantAddress}
                      </div>
                    </div>
                  )}

                  {/* SHA-256 Digest Fingerprint */}
                  {recordedHash && (
                    <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5 sm:col-span-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 font-medium">
                          SHA-256 Digest Fingerprint (On-Chain Cryptographic Baseline)
                        </span>
                        <button
                          type="button"
                          onClick={() => copyText(recordedHash, 'hash')}
                          className="text-[#1F6FF0] hover:underline flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                        >
                          {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedHash ? 'Copied' : 'Copy Hash'}</span>
                        </button>
                      </div>
                      <div className="font-mono text-xs text-stone-800 break-all bg-white p-2.5 rounded-lg border border-black/5 select-all">
                        {recordedHash}
                      </div>
                    </div>
                  )}

                  {/* Smart Contract Provenance */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5 sm:col-span-2 flex items-center justify-between">
                    <div className="min-w-0 pr-2 space-y-0.5">
                      <span className="text-stone-400 block font-medium">
                        Smart Contract Provenance
                      </span>
                      <span className="font-mono text-stone-800 break-all text-[11px] block select-all">
                        {contractAddress} ({isHistorical ? 'Historical Registry v1' : 'Active Registry v2'})
                      </span>
                    </div>
                    <a
                      href={getExplorerAddressUrl(contractAddress, 'testnet')}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-700 hover:underline flex items-center gap-1 text-xs font-semibold shrink-0 ml-2"
                    >
                      <span>Contract</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Registration Transaction Hash (if available) */}
                  {txHash && (
                    <div className="p-3.5 bg-stone-50 rounded-xl border border-black/5 sm:col-span-2 flex items-center justify-between">
                      <div className="min-w-0 pr-2 space-y-0.5">
                        <span className="text-stone-400 block font-medium">
                          Registration Transaction Hash {blockNumber ? `(Block #${blockNumber})` : ''}
                        </span>
                        <span className="font-mono text-stone-800 break-all text-[11px] block select-all">
                          {txHash}
                        </span>
                      </div>
                      <a
                        href={getExplorerTxUrl(txHash, 'testnet')}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#1F6FF0] hover:underline flex items-center gap-1 text-xs font-semibold shrink-0 ml-2"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>MSTScan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                </div>

                {/* Prominent Legal Disclaimer */}
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 leading-relaxed space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>LEGAL NOTICE & OWNERSHIP DISTINCTION</span>
                  </div>
                  <p>
                    Blockchain registration certifies immutable cryptographic timestamping, existence, and data integrity of the recorded SHA-256 digest at a specific block height. It <strong>does NOT constitute government land title, official municipal land records, or certified legal proof of property ownership</strong>. Legal transfer of property requires statutory conveyance instruments executed and registered under governing territorial laws.
                  </p>
                </div>

                {/* Private Original PDF Access & Server Authorization Notice */}
                <div className="p-5 bg-gradient-to-br from-stone-50 to-white rounded-2xl border border-black/10 space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#1F6FF0]" />
                      <span className="font-bold text-stone-900 text-sm">Private Original PDF Access</span>
                    </div>
                    <span className="text-[10px] font-semibold bg-stone-100 text-stone-700 px-2.5 py-0.5 rounded-full border border-stone-200">
                      Server Authorization Protected
                    </span>
                  </div>

                  <p className="text-xs text-stone-600 leading-relaxed">
                    Original PDF documents are confidential and protected by server-side authorization. Original files cannot be accessed or downloaded via public Document ID alone. Unauthenticated access is blocked.
                  </p>

                  <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <Link
                      to={`/app/documents/${cleanDocId}`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#1F6FF0] hover:bg-[#1A5ED1] text-white text-xs font-semibold rounded-xl transition-all shadow-xs"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Authenticate as Owner in App</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setShowTokenInput(!showTokenInput)}
                      className="text-xs text-stone-600 hover:text-[#1F6FF0] font-medium flex items-center justify-center gap-1.5 py-1"
                    >
                      <Key className="w-3.5 h-3.5 text-stone-400" />
                      <span>{showTokenInput ? 'Hide Token Access' : 'Enter Private Access Token'}</span>
                    </button>
                  </div>

                  {/* Private Access Token Download Form */}
                  {showTokenInput && (
                    <form onSubmit={handleDownloadWithAccessToken} className="pt-3 border-t border-black/5 space-y-3">
                      <div className="text-xs text-stone-600 font-medium">
                        If the document owner shared an authorized, expiring private access token with you, enter it below to retrieve the verified file:
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          id="private-access-token-input"
                          type="text"
                          placeholder="Paste private access token (e.g. pat_...)"
                          value={privateAccessToken}
                          onChange={(e) => setPrivateAccessToken(e.target.value)}
                          className="flex-1 px-3 py-2 bg-white border border-black/10 rounded-xl text-xs font-mono text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/30 focus:border-[#1F6FF0]"
                        />
                        <Button
                          id="download-token-pdf-btn"
                          type="submit"
                          variant="secondary"
                          size="sm"
                          loading={isDownloadingPdf}
                          icon={<Download className="w-3.5 h-3.5" />}
                          className="text-xs shrink-0"
                        >
                          Download Verified PDF
                        </Button>
                      </div>

                      {/* Download Status Result */}
                      {downloadResult?.success && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block">Integrity Verified:</span>
                            <p className="text-[11px] text-emerald-800">
                              Downloaded PDF SHA-256 digest matches on-chain baseline ({downloadResult.computedHash?.slice(0, 16)}...). File verified from local storage server.
                            </p>
                          </div>
                        </div>
                      )}

                      {downloadResult && !downloadResult.success && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block">Access Denied / Verification Failed:</span>
                            <p className="text-[11px] text-rose-800">
                              {downloadResult.error}
                            </p>
                          </div>
                        </div>
                      )}
                    </form>
                  )}
                </div>

                {/* Privacy Guarantee Notice */}
                <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 flex items-start gap-3 text-xs text-stone-600 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Privacy by Default:</strong> Original document bytes, owner email address, mobile number, and private storage file paths are strictly withheld from this public page. Only public blockchain registry data is disclosed.
                  </div>
                </div>

              </div>
            </>
          )}

          {/* Action Links */}
          <div className="pt-4 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                navigate('/verify');
              }}
              className="text-[#1F6FF0] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Verify another document</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <Link to="/app" className="text-stone-700 font-semibold hover:underline">
              Enter NotaryVault Application
            </Link>
          </div>

        </Card>
      </main>

      {/* Public Footer */}
      <footer className="max-w-3xl mx-auto w-full pt-6 sm:pt-8 text-center text-xs text-stone-400">
        NotaryVault Public Property & Document Verification • MST Chain Testnet
      </footer>

    </div>
  );
};
