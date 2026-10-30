import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, X, ArrowUpRight, ShieldCheck, FileText } from 'lucide-react';
import { Button } from '../ui/Button';

export const LandingNav: React.FC = () => {
  const navigate = useNavigate();
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#F7F4ED]/90 backdrop-blur-md transition-all">
      <div className="max-w-[1660px] mx-auto px-6 md:px-12 lg:px-20 h-20 md:h-24 flex items-center justify-between">
        
        {/* Left: Brand Logo & Wordmark */}
        <div className="flex items-center gap-10">
          <Link to="/" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-black rounded-lg">
            {/* Gradient Logo Mark matching reference */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF2E88] via-[#8B7BF0] to-[#1F6FF0] flex items-center justify-center shadow-sm transition-transform duration-200 group-hover:scale-105">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span className="text-2xl md:text-[28px] font-bold tracking-tight text-[#1C1C1C]">
              NotaryVault
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-8 text-[17px] font-medium text-[#1C1C1C]">
            
            {/* Solutions Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}
            >
              <button 
                type="button" 
                onClick={() => setSolutionsOpen(!solutionsOpen)}
                aria-expanded={solutionsOpen}
                className="flex items-center gap-1 hover:text-black py-2 focus:outline-none cursor-pointer"
              >
                <span>Solutions</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${solutionsOpen ? 'rotate-180' : ''}`} />
              </button>

              {solutionsOpen && (
                <div className="absolute top-full left-0 w-80 bg-white border border-black/10 rounded-2xl shadow-xl p-4 space-y-1 animate-in fade-in slide-in-from-top-1">
                  <Link 
                    to="/app/documents" 
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1F6FF0] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#1C1C1C]">Property & Deed Integrity</div>
                      <div className="text-xs text-stone-500 mt-0.5">Track land deeds, conveyances, and title chains.</div>
                    </div>
                  </Link>

                  <Link 
                    to="/app/verify" 
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-stone-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#1C1C1C]">Instant Document Verification</div>
                      <div className="text-xs text-stone-500 mt-0.5">Cryptographic SHA-256 match and on-chain audits.</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* Resources Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setResourcesOpen(true)}
              onMouseLeave={() => setResourcesOpen(false)}
            >
              <button 
                type="button" 
                onClick={() => setResourcesOpen(!resourcesOpen)}
                aria-expanded={resourcesOpen}
                className="flex items-center gap-1 hover:text-black py-2 focus:outline-none cursor-pointer"
              >
                <span>Resources</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${resourcesOpen ? 'rotate-180' : ''}`} />
              </button>

              {resourcesOpen && (
                <div className="absolute top-full left-0 w-72 bg-white border border-black/10 rounded-2xl shadow-xl p-4 space-y-1 animate-in fade-in slide-in-from-top-1">
                  <a 
                    href="#faq" 
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-stone-50 text-sm font-medium text-[#1C1C1C] transition-colors"
                  >
                    <span>Verification FAQ</span>
                    <ArrowUpRight className="w-4 h-4 text-stone-400" />
                  </a>
                  <Link 
                    to="/app/verify" 
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-stone-50 text-sm font-medium text-[#1C1C1C] transition-colors"
                  >
                    <span>Verification Portal</span>
                    <ArrowUpRight className="w-4 h-4 text-stone-400" />
                  </Link>
                  <Link 
                    to="/app/activity" 
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-stone-50 text-sm font-medium text-[#1C1C1C] transition-colors"
                  >
                    <span>Audit Trail Log</span>
                    <ArrowUpRight className="w-4 h-4 text-stone-400" />
                  </Link>
                </div>
              )}
            </div>

            <a href="#features" className="hover:text-black transition-colors">Community</a>
            <a href="#features" className="hover:text-black transition-colors">Enterprise</a>
            <a href="#pricing" className="hover:text-black transition-colors">Pricing</a>
            <a href="#security" className="hover:text-black transition-colors">Security</a>
          </nav>
        </div>

        {/* Right CTA Button */}
        <div className="hidden lg:flex items-center gap-4">
          <Button 
            variant="primary-landing" 
            size="md"
            onClick={() => navigate('/app')}
            className="text-[17px] px-6 py-3 rounded-xl font-medium tracking-tight cursor-pointer"
          >
            Open NotaryVault
          </Button>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="lg:hidden flex items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2.5 rounded-xl bg-white/70 border border-black/10 text-stone-800"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white/95 backdrop-blur-xl border-b border-black/10 px-6 py-6 space-y-4">
          <div className="flex flex-col gap-3 font-medium text-[#1C1C1C]">
            <Link to="/app" onClick={() => setMobileMenuOpen(false)} className="py-2 text-lg font-semibold">
              Dashboard
            </Link>
            <Link to="/app/documents" onClick={() => setMobileMenuOpen(false)} className="py-2 text-base">
              Document Library
            </Link>
            <Link to="/app/register" onClick={() => setMobileMenuOpen(false)} className="py-2 text-base">
              Register Document
            </Link>
            <Link to="/app/verify" onClick={() => setMobileMenuOpen(false)} className="py-2 text-base">
              Verify Document
            </Link>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="py-2 text-base">
              FAQ & Architecture
            </a>
          </div>
          <div className="pt-4 border-t border-black/5">
            <Button 
              variant="primary-landing" 
              className="w-full py-3.5 text-base"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/app');
              }}
            >
              Open NotaryVault
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};
