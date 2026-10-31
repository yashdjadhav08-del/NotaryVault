import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
  ShieldCheck, 
  Share2, 
  Clock, 
  Settings, 
  Menu, 
  X, 
  ExternalLink,
  ChevronRight,
  Globe,
  Crown,
  UserCheck,
  Users
} from 'lucide-react';

import { WalletButton } from '../ui/WalletButton';
import { useWallet } from '../../context/WalletContext';
import { useAuthors } from '../../context/AuthorContext';

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  title,
  subtitle,
  children,
  actions,
}) => {
  const location = useLocation();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const { 
    selectedNetwork, 
    setSelectedNetwork, 
    activeNetworkConfig, 
    status: walletStatus, 
    isSuperAuthor, 
    isSecondaryAuthor, 
    isAuthor 
  } = useWallet();
  const { pendingApplicationsCount } = useAuthors();

  React.useEffect(() => {
    if (mobileDrawerOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [mobileDrawerOpen]);

  const mainNavItems = [
    { label: 'Dashboard', path: '/app', icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: 'Documents', path: '/app/documents', icon: <FileText className="w-4 h-4" /> },
    { label: 'Register', path: '/app/register', icon: <PlusCircle className="w-4 h-4" /> },
    { label: 'Verify', path: '/app/verify', icon: <ShieldCheck className="w-4 h-4" /> },
    { label: 'Shared', path: '/app/shared', icon: <Share2 className="w-4 h-4" /> },
    { label: 'Activity', path: '/app/activity', icon: <Clock className="w-4 h-4" /> },
    { label: 'Settings', path: '/app/settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const visibleNavItems = mainNavItems.filter(item => {
    if (item.path === '/app/register') return isAuthor;
    if (item.path === '/app/shared') return isAuthor;
    return true;
  });

  const isActive = (path: string) => {
    if (path === '/app') {
      return location.pathname === '/app';
    }
    return location.pathname.startsWith(path);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B1220] text-stone-300">
      
      {/* App Logo & Header */}
      <div className="p-6 border-b border-[#1E293B] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#FF2E88] via-[#8B7BF0] to-[#1F6FF0] flex items-center justify-center shadow-md">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
            <div>
              <div className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                NotaryVault
                <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-semibold border ${
                  selectedNetwork === 'mainnet'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }`}>
                  {selectedNetwork === 'mainnet' ? 'MST Mainnet' : 'MST Testnet'}
                </span>
              </div>
              <div className="text-[11px] text-stone-400 font-medium">Document Management</div>
            </div>
          </Link>
          {mobileDrawerOpen && (
            <button 
              onClick={() => setMobileDrawerOpen(false)}
              className="text-stone-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Items List */}
        <div className="flex-1 overflow-y-auto px-3 py-6 space-y-6">
          
          {/* MAIN Section */}
          <div>
            <div className="px-3 text-[11px] font-bold text-stone-400 tracking-wider uppercase mb-2">
              MAIN
            </div>
            <nav className="space-y-1">
              {visibleNavItems.map(item => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.label}
                    to={item.path}
                    onClick={() => setMobileDrawerOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#152238] text-white shadow-sm font-semibold'
                        : 'text-stone-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className={active ? 'text-[#1F6FF0]' : 'text-stone-400'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* AUTHOR SYSTEM Section */}
          <div>
            <div className="px-3 text-[11px] font-bold text-stone-400 tracking-wider uppercase mb-2">
              AUTHOR SYSTEM
            </div>
            <nav className="space-y-1">
              {isSuperAuthor && (
                <Link
                  to="/app/author-applications"
                  onClick={() => setMobileDrawerOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive('/app/author-applications')
                      ? 'bg-[#152238] text-white shadow-sm font-semibold'
                      : 'text-stone-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive('/app/author-applications') ? 'text-amber-400' : 'text-stone-400'}>
                      <UserCheck className="w-4 h-4" />
                    </span>
                    <span>Review Applications</span>
                  </div>
                  {pendingApplicationsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] border border-amber-500/30">
                      {pendingApplicationsCount}
                    </span>
                  )}
                </Link>
              )}

              {isAuthor && (
                <Link
                  to="/app/authors"
                  onClick={() => setMobileDrawerOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive('/app/authors')
                      ? 'bg-[#152238] text-white shadow-sm font-semibold'
                      : 'text-stone-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={isActive('/app/authors') ? 'text-[#1F6FF0]' : 'text-stone-400'}>
                    <Users className="w-4 h-4" />
                  </span>
                  <span>Author Directory</span>
                </Link>
              )}

              {!isAuthor && (
                <Link
                  to="/app/apply-author"
                  onClick={() => setMobileDrawerOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive('/app/apply-author')
                      ? 'bg-[#152238] text-white shadow-sm font-semibold'
                      : 'text-stone-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={isActive('/app/apply-author') ? 'text-[#1F6FF0]' : 'text-stone-400'}>
                    <PlusCircle className="w-4 h-4" />
                  </span>
                  <span>Become an Author</span>
                </Link>
              )}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer with Active Network status */}
        <div className="p-4 border-t border-[#1E293B] bg-[#070C16]">
          <div className="rounded-xl bg-[#131D31] p-3 border border-white/5 text-xs text-stone-300 space-y-1.5">
            <div className="flex items-center justify-between font-semibold text-white">
              <span>{activeNetworkConfig.name}</span>
              <span className={`w-2 h-2 rounded-full ${selectedNetwork === 'mainnet' ? 'bg-purple-400' : 'bg-blue-400'}`} />
            </div>
            <p className="text-[11px] text-stone-400 leading-snug">
              Chain ID: {activeNetworkConfig.chainIdDecimal} ({activeNetworkConfig.chainIdHex}).
            </p>
            <a 
              href={activeNetworkConfig.explorerBaseUrl}
              target="_blank"
              rel="noreferrer" 
              className="inline-flex items-center gap-1 text-[11px] text-[#1F6FF0] hover:underline pt-1 font-medium"
            >
              <span>MSTScan Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F4ED] flex">
      
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-[260px] fixed inset-y-0 left-0 z-30 shadow-lg">
        {sidebarContent}
      </aside>

      {/* Mobile Off-Canvas Drawer */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative w-[280px] max-w-[80vw] h-full z-10">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[260px] flex flex-col min-h-screen min-w-0">
        
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-stone-200/90 shadow-xs px-4 sm:px-6 lg:px-10 py-3 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-4 min-w-0">
          
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink">
            {/* Hamburger on mobile */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-black/10 text-stone-700 hover:bg-stone-50 shrink-0"
              aria-label="Open sidebar menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb / Title Area */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-stone-400 font-medium">
                <Link to="/app" className="hover:text-stone-700">App</Link>
                <ChevronRight className="w-3 h-3 shrink-0" />
                <span className="text-stone-700 truncate">{title}</span>
              </div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-[#1C1C1C] truncate">
                {title}
              </h1>
            </div>
          </div>

          {/* Header Actions: Network Switcher + Role + Wallet */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {actions}

            {/* Explicit Network Selector */}
            <div className="inline-flex items-center p-0.5 sm:p-1 bg-stone-100 rounded-xl border border-black/5 text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setSelectedNetwork('testnet')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedNetwork === 'testnet'
                    ? 'bg-white text-blue-700 shadow-xs border border-black/5'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
                title="Select MST Chain Testnet (Chain ID 91562037)"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedNetwork === 'testnet' ? 'bg-blue-600' : 'bg-stone-400'}`} />
                <span className="hidden xs:inline sm:inline">Testnet</span>
                <span className="xs:hidden sm:hidden text-[10px]">Test</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedNetwork('mainnet')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedNetwork === 'mainnet'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
                title="Select MST Chain Mainnet (Chain ID 4646)"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedNetwork === 'mainnet' ? 'bg-white' : 'bg-stone-400'}`} />
                <span className="hidden xs:inline sm:inline">Mainnet</span>
                <span className="xs:hidden sm:hidden text-[10px]">Main</span>
              </button>
            </div>

            {/* Connected Role Badge */}
            {walletStatus === 'connected' && (
              <div className="hidden md:flex items-center shrink-0">
                {isSuperAuthor ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1.5 shadow-2xs">
                    <Crown className="w-3.5 h-3.5 text-amber-600" />
                    <span>Super Author</span>
                  </span>
                ) : isSecondaryAuthor ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-900 border border-blue-200 flex items-center gap-1.5 shadow-2xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#1F6FF0]" />
                    <span>Secondary Author</span>
                  </span>
                ) : (
                  <Link
                    to="/app/apply-author"
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 flex items-center gap-1.5 transition-all shadow-2xs"
                  >
                    <span>Public User</span>
                    <span className="text-[#1F6FF0] font-bold">• Apply</span>
                  </Link>
                )}
              </div>
            )}

            <div className="shrink-0">
              <WalletButton />
            </div>
          </div>
        </header>

        {/* Subtitle / Context Bar if provided */}
        {subtitle && (
          <div className="bg-[#FCFBF8] border-b border-stone-200/70 px-4 sm:px-6 lg:px-10 py-2.5 sm:py-3 text-xs md:text-sm text-stone-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="min-w-0">{subtitle}</span>
            <div className="flex items-center gap-3 font-mono text-[11px] text-stone-400 shrink-0">
              <span className="hidden sm:inline">Client Cryptography: WebCrypto SHA-256</span>
              <span className="hidden md:inline">•</span>
              <span className="hidden md:inline flex items-center gap-1 text-stone-500">
                <Globe className="w-3 h-3 text-stone-400" />
                Target Network: {activeNetworkConfig.name}
              </span>
            </div>
          </div>
        )}

        {/* Page Body */}
        <main className="flex-1 p-6 lg:p-10 max-w-[1600px] w-full mx-auto">
          {children}
        </main>

        {/* App Footer */}
        <footer className="border-t border-black/[0.06] py-4 px-6 lg:px-10 text-xs text-stone-500 flex flex-col sm:flex-row items-center justify-between gap-2 bg-white/50">
          <div>
            NotaryVault • Blockchain Document Verification on {activeNetworkConfig.name}
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-stone-700 font-medium hover:underline">Exit to Landing Page</Link>
          </div>
        </footer>

      </div>
    </div>
  );
};
