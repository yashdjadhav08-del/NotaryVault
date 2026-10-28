import React, { useState } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  FileText, 
  Search, 
  Lock, 
  Check
} from 'lucide-react';
import { StatusPill } from '../ui/StatusPill';

/**
 * 1. Mini UI: Stat cards & Request Queue (Screenshot 2 & 4)
 */
export const StatCardsAndQueueMiniUI: React.FC = () => {
  return (
    <div className="w-[420px] sm:w-[480px] bg-white rounded-2xl shadow-xl border border-black/10 p-5 space-y-4 select-none transform translate-x-4 translate-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Stat 1: Yellow clock tile */}
        <div className="bg-stone-50 border border-black/5 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold text-[#1C1C1C]">12</div>
            <div className="text-xs text-stone-500 font-medium mt-0.5">Pending Review</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Stat 2: Light blue tile */}
        <div className="bg-stone-50 border border-black/5 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold text-[#1C1C1C]">45</div>
            <div className="text-xs text-stone-500 font-medium mt-0.5">Verified Records</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-100/80 text-[#1F6FF0] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Verification Queue Table Card */}
      <div className="border border-black/5 rounded-xl p-3.5 bg-white">
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2.5">
          Recent Verification Queue
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1.5 border-b border-black/[0.04]">
            <div>
              <div className="font-semibold text-stone-800">Title Deed Conveyance</div>
              <div className="text-stone-400 text-[10px]">Aarav Mehta • NV-2026-000101</div>
            </div>
            <StatusPill status="Verified" size="sm" />
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-black/[0.04]">
            <div>
              <div className="font-semibold text-stone-800">Commercial Lease Suite 401</div>
              <div className="text-stone-400 text-[10px]">Priya Nair • NV-2026-000102</div>
            </div>
            <StatusPill status="Verified" size="sm" />
          </div>
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="font-semibold text-stone-800">Industrial Allotment Deed</div>
              <div className="text-stone-400 text-[10px]">Meera Deshmukh • NV-2026-000106</div>
            </div>
            <StatusPill status="Pending" size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 2. Mini UI: Recent List with avatars & status pills (Screenshot 3)
 */
export const RecentListMiniUI: React.FC = () => {
  return (
    <div className="w-[420px] sm:w-[480px] bg-white rounded-2xl shadow-xl border border-black/10 p-5 select-none transform translate-x-4 translate-y-4">
      <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">
        Recent Document Audit Stream
      </div>
      <div className="divide-y divide-black/[0.06]">
        <div className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#1C1C1C]">Property Conveyance Deed</div>
              <div className="text-xs text-stone-400">Aarav Mehta • NV-2026-000101</div>
            </div>
          </div>
          <StatusPill status="Verified" size="sm" />
        </div>

        <div className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#1C1C1C]">Flagged Boundary Alteration</div>
              <div className="text-xs text-stone-400">Ananya Verma • NV-2026-000107</div>
            </div>
          </div>
          <StatusPill status="Hash Mismatch" size="sm" />
        </div>

        <div className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#1C1C1C]">Special Power of Attorney</div>
              <div className="text-xs text-stone-400">Arjun Dasgupta • NV-2026-000110</div>
            </div>
          </div>
          <StatusPill status="Verified" size="sm" />
        </div>
      </div>
    </div>
  );
};

/**
 * 3. Mini UI: Onboarding & Classification step card (Screenshot 4, 8)
 */
export const OnboardingStepMiniUI: React.FC = () => {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const options = [
    { title: 'Property Deed / Freehold Title', desc: 'Conveyance, allotment letters, and registry grants' },
    { title: 'Commercial or Residential Lease', desc: 'Fixed tenancy agreements and lease covenants' },
    { title: 'Sworn Affidavit or Power of Attorney', desc: 'Notarized declarations and representative mandates' },
  ];

  return (
    <div className="w-[420px] sm:w-[480px] bg-white rounded-2xl shadow-xl border border-black/10 p-6 select-none transform translate-x-4 translate-y-4">
      {/* Segmented progress indicator */}
      <div className="flex items-center gap-1.5 mb-5">
        <div className="h-1 flex-1 bg-black rounded-full" />
        <div className="h-1 flex-1 bg-black rounded-full" />
        <div className="h-1 flex-1 bg-black rounded-full" />
        <div className="h-1 flex-1 bg-stone-200 rounded-full" />
      </div>

      <div className="text-center mb-5">
        <h4 className="text-lg font-bold text-[#1C1C1C] leading-snug">
          Select Document Classification
        </h4>
        <p className="text-xs text-stone-400 mt-1">
          Determines audit profile and cryptographic hash metadata.
        </p>
      </div>

      {/* Selectable full-width rows */}
      <div className="space-y-2.5">
        {options.map((opt, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <div
              key={idx}
              onClick={() => setSelectedIdx(idx)}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                isSelected
                  ? 'bg-[#0A0A0A] text-white border-black shadow-sm'
                  : 'bg-white hover:bg-stone-50 border-black/10 text-stone-800'
              }`}
            >
              <div>
                <div className="text-xs font-semibold">{opt.title}</div>
                <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                  {opt.desc}
                </div>
              </div>
              <div className="shrink-0 ml-2">
                {isSelected ? (
                  <div className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border border-black/20" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * 4. Mini UI: Dark dashboard with sidebar (Screenshot 4 - AccessDemo style)
 */
export const DarkDashboardMiniUI: React.FC = () => {
  return (
    <div className="w-[440px] sm:w-[500px] h-[340px] bg-white rounded-2xl shadow-2xl border border-black/10 flex overflow-hidden select-none transform translate-x-4 translate-y-4">
      {/* Dark Navy Sidebar */}
      <div className="w-36 bg-[#0B1220] p-3 text-stone-300 flex flex-col justify-between shrink-0">
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 pt-1">
            <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
              NV
            </div>
            <span className="text-xs font-bold text-white tracking-tight">NotaryDemo</span>
          </div>

          <div>
            <div className="text-[9px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              MAIN
            </div>
            <div className="space-y-0.5 text-[11px]">
              <div className="bg-[#152238] text-white font-medium px-2 py-1 rounded-lg">
                Dashboard
              </div>
              <div className="text-stone-400 px-2 py-1">Documents</div>
              <div className="text-stone-400 px-2 py-1">Verification</div>
            </div>
          </div>

          <div>
            <div className="text-[9px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              ADMIN
            </div>
            <div className="space-y-0.5 text-[11px]">
              <div className="text-stone-500 px-2 py-1 flex items-center justify-between">
                <span>Contracts</span>
                <Lock className="w-2.5 h-2.5" />
              </div>
              <div className="text-stone-500 px-2 py-1 flex items-center justify-between">
                <span>Relays</span>
                <Lock className="w-2.5 h-2.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 p-4 bg-white overflow-hidden flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
            <div>
              <div className="text-sm font-bold text-[#1C1C1C]">Dashboard</div>
              <div className="text-[10px] text-stone-400">Welcome back! Prototype node ready.</div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 my-2.5">
            <div className="p-2 border border-black/5 rounded-lg bg-stone-50">
              <div className="text-[10px] text-stone-500">Active Records</div>
              <div className="text-base font-bold text-stone-900">12</div>
              <div className="text-[9px] text-emerald-600 font-medium">+2 this week</div>
            </div>
            <div className="p-2 border border-black/5 rounded-lg bg-stone-50">
              <div className="text-[10px] text-stone-500">Shared Links</div>
              <div className="text-base font-bold text-stone-900">8</div>
              <div className="text-[9px] text-stone-400">3 active, 5 exp</div>
            </div>
          </div>

          {/* Quick Actions Card with Blue primary button */}
          <div className="p-2.5 rounded-xl border border-black/5 bg-[#F9F9F8]">
            <div className="text-[10px] font-bold text-stone-500 mb-1.5 uppercase">
              Quick Actions
            </div>
            <div className="flex items-center gap-1.5">
              <button className="bg-[#1F6FF0] text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-sm">
                + Register New
              </button>
              <button className="bg-white border border-black/10 text-stone-700 text-[10px] font-medium px-2 py-1.5 rounded-lg">
                Verify ID
              </button>
            </div>
          </div>
        </div>

        <div className="text-[9px] text-stone-400 border-t border-black/[0.04] pt-1">
          Cryptographic Integrity: Verified
        </div>
      </div>
    </div>
  );
};

/**
 * 5. Mini UI: Pink-sidebar Resource Hub (Screenshot 3)
 */
export const PinkSidebarResourceMiniUI: React.FC = () => {
  return (
    <div className="w-[440px] sm:w-[500px] h-[340px] bg-white rounded-2xl shadow-2xl border border-black/10 flex overflow-hidden select-none transform translate-x-4 translate-y-4">
      {/* Pink/Magenta Gradient Sidebar */}
      <div className="w-36 bg-gradient-to-b from-[#FF2E88] to-[#D91B6B] p-3 text-white flex flex-col justify-between shrink-0">
        <div className="space-y-3">
          <div className="text-xs font-bold pt-1">Resource Hub</div>
          <div className="space-y-1 text-[11px]">
            <div className="bg-white/20 text-white font-medium px-2 py-1 rounded-lg">
              All Guides
            </div>
            <div className="text-white/80 px-2 py-1">Standards</div>
            <div className="text-white/80 px-2 py-1">Audit Trail</div>
            <div className="text-white/80 px-2 py-1">FAQ</div>
          </div>
        </div>
        <div className="text-[9px] text-white/70">Notary Knowledge</div>
      </div>

      {/* Main Area with Search & Articles */}
      <div className="flex-1 p-4 bg-white flex flex-col justify-between">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-bold text-[#1C1C1C]">Verification Guides</div>
            <div className="text-[10px] text-stone-400">Integrity baselines and legal boundaries</div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-stone-400" />
            <input 
              readOnly 
              placeholder="Search guides, SHA-256 protocols..." 
              className="w-full bg-stone-50 border border-black/10 rounded-lg text-xs py-1.5 pl-7 pr-2"
            />
          </div>

          {/* Category Cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 border border-black/5 rounded-lg bg-pink-50/50">
              <div className="text-[10px] font-bold text-pink-700">Deed Standards</div>
              <div className="text-[9px] text-stone-400">14 articles</div>
            </div>
            <div className="p-2 border border-black/5 rounded-lg bg-purple-50/50">
              <div className="text-[10px] font-bold text-purple-700">QR Verification</div>
              <div className="text-[9px] text-stone-400">8 articles</div>
            </div>
          </div>

          {/* Article list */}
          <div className="space-y-1.5 text-[11px]">
            <div className="font-semibold text-stone-800 truncate">• SHA-256 Client-Side Hashing Process</div>
            <div className="font-semibold text-stone-800 truncate">• Distinguishing Integrity vs Legal Proof</div>
          </div>
        </div>

        <div className="text-[9px] text-stone-400 border-t border-black/[0.04] pt-1">
          NotaryVault Knowledge Series
        </div>
      </div>
    </div>
  );
};
