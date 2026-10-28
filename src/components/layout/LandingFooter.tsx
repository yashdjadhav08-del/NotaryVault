import React from 'react';
import { Link } from 'react-router-dom';

export const LandingFooter: React.FC = () => {
  return (
    <footer className="w-full px-6 md:px-12 lg:px-20 pb-16 pt-6">
      <div className="max-w-[1660px] mx-auto bg-[#FCFBF8] border border-black/[0.06] rounded-[28px] p-8 md:p-14 lg:p-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8">
          
          {/* Brand Mark Column */}
          <div className="lg:col-span-3 space-y-4">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF2E88] via-[#8B7BF0] to-[#1F6FF0] flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <span className="text-2xl font-bold tracking-tight text-[#1C1C1C]">
                NotaryVault
              </span>
            </Link>
            <p className="text-sm text-[#5F5F5F] leading-relaxed max-w-xs">
              Cryptographic integrity verification and audit tracking for property deeds, agreements, and affidavits.
            </p>
            <div className="pt-2 text-xs text-stone-400">
              © {new Date().getFullYear()} NotaryVault Systems. Prototype Phase.
            </div>
          </div>

          {/* 5 Link Columns matching reference */}
          <div className="lg:col-span-9 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-8">
            
            {/* Column 1: Company / Product */}
            <div className="space-y-4">
              <h4 className="text-[17px] font-semibold text-[#1C1C1C]">Product</h4>
              <ul className="space-y-3.5 text-[16px] text-[#5F5F5F]">
                <li><Link to="/app" className="hover:text-black transition-colors">Dashboard</Link></li>
                <li><Link to="/app/documents" className="hover:text-black transition-colors">Document Library</Link></li>
                <li><Link to="/app/register" className="hover:text-black transition-colors">Register Deed</Link></li>
                <li><Link to="/app/verify" className="hover:text-black transition-colors">Verify Fingerprint</Link></li>
                <li><Link to="/app/shared" className="hover:text-black transition-colors">Shared Access</Link></li>
              </ul>
            </div>

            {/* Column 2: Platform */}
            <div className="space-y-4">
              <h4 className="text-[17px] font-semibold text-[#1C1C1C]">Platform</h4>
              <ul className="space-y-3.5 text-[16px] text-[#5F5F5F]">
                <li><Link to="/app/verify" className="hover:text-black transition-colors">Verification Portal</Link></li>
                <li><Link to="/app/activity" className="hover:text-black transition-colors">Audit Trail</Link></li>
                <li><span className="text-stone-400 cursor-not-allowed">MST Chain Testnet</span></li>
                <li><span className="text-stone-400 cursor-not-allowed">BridgeKey Provider</span></li>
                <li><span className="text-stone-400 cursor-not-allowed">Smart Contract ABI (Phase 4)</span></li>
              </ul>
            </div>

            {/* Column 3: Resources */}
            <div className="space-y-4">
              <h4 className="text-[17px] font-semibold text-[#1C1C1C]">Resources</h4>
              <ul className="space-y-3.5 text-[16px] text-[#5F5F5F]">
                <li><a href="#faq" className="hover:text-black transition-colors">Verification FAQ</a></li>
                <li><a href="#features" className="hover:text-black transition-colors">Unhappy Paths Guide</a></li>
                <li><span className="text-stone-400 cursor-not-allowed">Integrity Whitepaper</span></li>
                <li><span className="text-stone-400 cursor-not-allowed">Developer API</span></li>
                <li><Link to="/app/settings" className="hover:text-black transition-colors">Demo Wallet Status</Link></li>
              </ul>
            </div>

            {/* Column 4: Legal */}
            <div className="space-y-4">
              <h4 className="text-[17px] font-semibold text-[#1C1C1C]">Legal</h4>
              <ul className="space-y-3.5 text-[16px] text-[#5F5F5F]">
                <li><a href="#disclaimer" className="hover:text-black transition-colors">Demo Disclaimer</a></li>
                <li><a href="#disclaimer" className="hover:text-black transition-colors leading-snug block">Not Legal Ownership Proof</a></li>
                <li><a href="#disclaimer" className="hover:text-black transition-colors leading-snug block">Client-Side Hashing Policy</a></li>
                <li><a href="#disclaimer" className="hover:text-black transition-colors">Terms of Prototype</a></li>
              </ul>
            </div>

            {/* Column 5: Project */}
            <div className="space-y-4">
              <h4 className="text-[17px] font-semibold text-[#1C1C1C]">Project</h4>
              <ul className="space-y-3.5 text-[16px] text-[#5F5F5F]">
                <li><span className="text-[#1C1C1C] font-medium">Solidity Ready</span></li>
                <li><span className="text-[#5F5F5F]">Ethereum Sepolia</span></li>
                <li><span className="text-[#5F5F5F]">SHA-256 Digest</span></li>
                <li><span className="text-[#5F5F5F]">MetaMask Ready</span></li>
                <li><Link to="/app/settings" className="text-[#1F6FF0] hover:underline font-medium">Reset Demo Data</Link></li>
              </ul>
            </div>

          </div>
        </div>

        {/* Prototype Honest Disclaimer Note */}
        <div id="disclaimer" className="mt-12 pt-8 border-t border-black/[0.06] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-stone-500">
          <div className="max-w-4xl leading-relaxed">
            <span className="font-semibold text-stone-700">Important Prototype Notice:</span> NotaryVault is a frontend demonstration prototype for document integrity tracking and simulated verification. Digital hashes and simulated results do not establish legal ownership, replace registered government authorities, or prove the official identity of a notary. Uploaded files are hashed client-side in the browser and never transmitted or stored on a blockchain in this demo.
          </div>
          <div className="shrink-0 text-stone-400 font-mono">
            BUILD: v1.0.4-DEMO
          </div>
        </div>
      </div>
    </footer>
  );
};
