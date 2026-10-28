import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { StatusPill } from '../components/ui/StatusPill';
import { useDocuments } from '../context/DocumentContext';
import { 
  HelpCircle, 
  Lock,
  ArrowRight
} from 'lucide-react';
import { formatDate } from '../lib/format';
import { truncateHash } from '../lib/hash';

export const QRVerificationPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const { getDocumentById } = useDocuments();

  const doc = getDocumentById(documentId || '');

  return (
    <div className="min-h-screen bg-[#F7F4ED] text-[#1C1C1C] flex flex-col justify-between p-6 md:p-12 selection:bg-[#3B6EF5] selection:text-white">
      
      {/* Top Public Header */}
      <header className="max-w-2xl mx-auto w-full flex items-center justify-between pb-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF2E88] via-[#8B7BF0] to-[#1F6FF0] flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-[#1C1C1C]">
            NotaryVault
          </span>
        </Link>

        <span className="text-xs font-mono bg-white px-2.5 py-1 rounded-full border border-black/10 text-stone-600">
          Public QR Portal
        </span>
      </header>

      {/* Main Verification Card */}
      <main className="max-w-2xl mx-auto w-full my-auto">
        <Card className="p-8 md:p-10 bg-white border border-black/10 shadow-lg space-y-6">
          
          {doc ? (
            <>
              {/* Status Header */}
              <div className="flex items-start justify-between gap-4 pb-6 border-b border-black/[0.06]">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block">
                    Public Verification Record
                  </span>
                  <h1 className="text-2xl font-bold text-[#1C1C1C] tracking-tight">
                    Document {doc.id}
                  </h1>
                </div>
                <StatusPill status={doc.status} size="md" />
              </div>

              {/* Public Permitted Metadata Grid */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  
                  <div className="p-4 bg-stone-50 rounded-2xl border border-black/5">
                    <span className="text-stone-400 block font-medium mb-1">
                      Document Classification
                    </span>
                    <span className="text-sm font-bold text-stone-900">
                      {doc.type}
                    </span>
                  </div>

                  <div className="p-4 bg-stone-50 rounded-2xl border border-black/5">
                    <span className="text-stone-400 block font-medium mb-1">
                      Registration Timestamp
                    </span>
                    <span className="text-sm font-bold text-stone-900">
                      {formatDate(doc.registeredAt)}
                    </span>
                  </div>

                  <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 sm:col-span-2">
                    <span className="text-stone-400 block font-medium mb-1">
                      SHA-256 Digest Fingerprint (Integrity Reference)
                    </span>
                    <div className="font-mono text-xs text-stone-800 break-all bg-white p-2.5 rounded-xl border border-black/10">
                      {truncateHash(doc.sha256Hash, 16, 16)}
                    </div>
                  </div>

                </div>

                {/* Privacy & Scope Disclosure */}
                <div className="p-4 bg-stone-50/80 rounded-2xl border border-black/5 flex items-start gap-3 text-xs text-stone-600 leading-relaxed">
                  <Lock className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
                  <div>
                    <strong>Confidentiality Preserved:</strong> To protect party privacy, actual document text, names, financial terms, and attachments are strictly withheld from public QR lookups.
                  </div>
                </div>
              </div>

              {/* Legal Limitation Notice */}
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 leading-relaxed">
                <strong>Verification Notice:</strong> This record was checked against the NotaryVault document registry. An active verification status reflects cryptographic digest comparison; it does not replace statutory land registry deeds or official government certification.
              </div>
            </>
          ) : (
            /* Document Not Found in Public Portal */
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                <HelpCircle className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-[#1C1C1C]">
                Document Record Not Found
              </h2>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                The identifier <code className="font-mono font-bold text-stone-800">{documentId}</code> does not match any registered document in the NotaryVault catalog.
              </p>
            </div>
          )}

          {/* Action Links */}
          <div className="pt-4 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <Link to="/app/verify" className="text-[#1F6FF0] font-semibold hover:underline flex items-center gap-1">
              <span>Verify another document</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            <Link to="/app" className="text-stone-700 font-semibold hover:underline">
              Enter NotaryVault Application
            </Link>
          </div>

        </Card>
      </main>

      {/* Public Footer */}
      <footer className="max-w-2xl mx-auto w-full pt-8 text-center text-xs text-stone-400">
        NotaryVault Public QR Verification Service • WebCrypto SHA-256 Standard
      </footer>

    </div>
  );
};
