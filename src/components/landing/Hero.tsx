import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Check, ShieldCheck } from 'lucide-react';

export const Hero: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="relative w-full pt-12 md:pt-20 pb-20 md:pb-32 overflow-hidden">
      
      {/* Container */}
      <div className="max-w-[1660px] mx-auto px-6 md:px-12 lg:px-20 relative z-10">
        
        {/* Eyebrow */}
        <div className="text-center mb-6">
          <span className="text-lg md:text-2xl font-medium text-[#1C1C1C]">
            Tools for document integrity
          </span>
        </div>

        {/* H1 Heading */}
        <div className="text-center max-w-5xl mx-auto mb-8">
          <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-[96px] font-extrabold text-[#1C1C1C] tracking-tighter leading-[1.02]">
            Verify real documents,<br />
            not paper promises
          </h1>
        </div>

        {/* Subtext */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-lg md:text-2xl font-medium text-[#5F5F5F] leading-snug">
            Bring cryptographic certainty to deeds, leases, and affidavits. Protect digital assets with tamper-evident tracking.
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex justify-center mb-12">
          <Button
            variant="primary-landing"
            size="lg"
            onClick={() => navigate('/app')}
            className="text-lg px-8 py-4 rounded-xl font-medium shadow-md hover:scale-[1.02] transition-transform"
          >
            Get started
          </Button>
        </div>
      </div>

      {/* =========================================================================
          FLOATING DESIGN-TOOL DECORATIONS (mimicking dashed blue selection boxes)
          ========================================================================= */}

      {/* 1. Upper Left: Empty outlined Pill shape with "Verified" tag */}
      <div className="hidden xl:block absolute top-12 left-[12%] z-0 pointer-events-none">
        <div className="selection-box p-2 rounded-full">
          <div className="selection-handle tl" />
          <div className="selection-handle tr" />
          <div className="selection-handle bl" />
          <div className="selection-handle br" />
          <div className="w-56 h-14 rounded-full border-2 border-black flex items-center justify-center gap-2 bg-[#F7F4ED]/80 px-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-sm tracking-wide text-black uppercase">
              Verified Integrity
            </span>
          </div>
        </div>
      </div>

      {/* 2. Left Edge: Large rounded gradient square (blue -> pink -> orange) cropped off left edge */}
      <div className="hidden lg:block absolute top-40 -left-16 z-0 pointer-events-none">
        <div className="selection-box p-3 rounded-[36px]">
          <div className="selection-handle tl" />
          <div className="selection-handle tr" />
          <div className="selection-handle bl" />
          <div className="selection-handle br" />
          <div className="w-72 h-80 rounded-[32px] bg-gradient-to-br from-[#1F6FF0] via-[#FF2E88] to-[#FF6A2B] shadow-lg opacity-90" />
        </div>
      </div>

      {/* 3. Upper Right: Monospace hash / typography specimen */}
      <div className="hidden xl:block absolute top-16 right-[14%] z-0 pointer-events-none">
        <div className="selection-box p-3 rounded-2xl bg-[#F7F4ED]/90">
          <div className="selection-handle tl" />
          <div className="selection-handle tr" />
          <div className="selection-handle bl" />
          <div className="selection-handle br" />
          <div className="space-y-1">
            <div className="text-4xl md:text-5xl font-extrabold text-[#1C1C1C] font-mono tracking-tight">
              SHA-256
            </div>
            <div className="text-xs font-mono text-stone-500">
              0x9f2a...8ce1
            </div>
          </div>
        </div>
      </div>

      {/* 4. Lower Left: 2x2 grid of color-swatch circles (Status colors: Green, Amber, Red, Neutral) */}
      <div className="hidden lg:block absolute bottom-12 left-[15%] z-0 pointer-events-none">
        <div className="selection-box p-3 rounded-2xl bg-[#F7F4ED]/90">
          <div className="selection-handle tl" />
          <div className="selection-handle tr" />
          <div className="selection-handle bl" />
          <div className="selection-handle br" />
          <div className="grid grid-cols-2 gap-3">
            {/* Green (Verified) */}
            <div className="w-9 h-9 rounded-full bg-[#16A34A] flex items-center justify-center text-white shadow-sm" title="Verified">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
            {/* Amber (Pending) */}
            <div className="w-9 h-9 rounded-full bg-[#F59E0B] shadow-sm" title="Pending" />
            {/* Red (Mismatch) */}
            <div className="w-9 h-9 rounded-full bg-[#EF4444] shadow-sm" title="Hash Mismatch" />
            {/* Black / Neutral */}
            <div className="w-9 h-9 rounded-full bg-[#1C1C1C] shadow-sm" title="Registered" />
          </div>
        </div>
      </div>

      {/* 5. Lower Right: Two overlapping circular avatars */}
      <div className="hidden lg:block absolute bottom-20 right-[20%] z-0 pointer-events-none">
        <div className="selection-box p-3 rounded-2xl bg-[#F7F4ED]/90">
          <div className="selection-handle tl" />
          <div className="selection-handle tr" />
          <div className="selection-handle bl" />
          <div className="selection-handle br" />
          <div className="flex -space-x-3">
            <div className="w-12 h-12 rounded-full border-2 border-white bg-gradient-to-tr from-stone-700 to-stone-900 text-white flex items-center justify-center text-sm font-bold shadow-sm">
              AM
            </div>
            <div className="w-12 h-12 rounded-full border-2 border-white bg-gradient-to-tr from-blue-600 to-indigo-800 text-white flex items-center justify-center text-sm font-bold shadow-sm">
              PN
            </div>
          </div>
        </div>
      </div>

      {/* 6. Right Edge: Second tall gradient panel (blue -> pink) with on-chain verified tile cropped off edge */}
      <div className="hidden lg:block absolute top-36 -right-16 z-0 pointer-events-none">
        <div className="selection-box p-3 rounded-[36px]">
          <div className="selection-handle tl" />
          <div className="selection-handle tr" />
          <div className="selection-handle bl" />
          <div className="selection-handle br" />
          <div className="w-64 h-80 rounded-[32px] bg-gradient-to-br from-[#1F6FF0] to-[#FF2E88] p-6 flex flex-col justify-end shadow-lg">
            <div className="w-20 h-20 bg-white rounded-xl p-2.5 shadow-md flex flex-col items-center justify-center text-center">
              <ShieldCheck className="w-7 h-7 text-[#1F6FF0]" />
              <span className="text-[8px] font-bold text-stone-700 tracking-tight mt-1">VERIFIED</span>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
};
