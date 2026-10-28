import React from 'react';
import { 
  StatCardsAndQueueMiniUI, 
  RecentListMiniUI, 
  OnboardingStepMiniUI, 
  DarkDashboardMiniUI, 
  PinkSidebarResourceMiniUI 
} from './MiniUIs';

export const FeatureStack: React.FC = () => {
  return (
    <section id="features" className="w-full py-16 md:py-28 px-6 md:px-12 lg:px-20">
      <div className="max-w-[1660px] mx-auto space-y-16">
        
        {/* Section Heading matching reference */}
        <div>
          <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-[76px] font-extrabold text-[#1C1C1C] tracking-tighter leading-[1.04]">
            Records aren't enough
          </h2>
          <p className="mt-4 text-xl md:text-2xl font-medium text-[#5F5F5F] max-w-2xl">
            Paper files and unverified PDFs leave room for disputes. NotaryVault gives teams cryptographic certainty.
          </p>
        </div>

        {/* Feature Cards Stack (Alternating Layouts) */}
        <div className="space-y-12 md:space-y-16">

          {/* Card 1: Text Left, Visual Right */}
          <div className="bg-[#FCFBF8] border border-black/[0.06] rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center p-8 md:p-12 lg:p-16 gap-10">
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-3xl md:text-4xl font-bold tracking-tight text-[#1C1C1C] leading-snug">
                Register with a unique ID and SHA-256 hash
              </h3>
              <p className="text-lg md:text-[20px] text-[#5F5F5F] leading-relaxed">
                Compute deterministic 64-character digital fingerprints directly inside your browser. Files remain strictly client-side, while unique Document IDs keep your entire catalog structured.
              </p>
            </div>
            <div className="lg:col-span-7 flex justify-end">
              <div className="w-full max-w-[620px] h-[360px] md:h-[400px] rounded-3xl bg-gradient-to-tr from-[#1F6FF0] via-[#5B8DEF] to-[#F7F4ED] p-6 relative overflow-hidden flex items-end justify-end shadow-inner">
                <StatCardsAndQueueMiniUI />
              </div>
            </div>
          </div>

          {/* Card 2: Visual Left, Text Right (Alternating) */}
          <div className="bg-[#FCFBF8] border border-black/[0.06] rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center p-8 md:p-12 lg:p-16 gap-10">
            <div className="lg:col-span-7 order-2 lg:order-1 flex justify-start">
              <div className="w-full max-w-[620px] h-[360px] md:h-[400px] rounded-3xl bg-gradient-to-tr from-[#FF2E88] via-[#FF6A2B] to-[#FFE8D6] p-6 relative overflow-hidden flex items-end justify-start shadow-inner">
                <RecentListMiniUI />
              </div>
            </div>
            <div className="lg:col-span-5 order-1 lg:order-2 space-y-4">
              <h3 className="text-3xl md:text-4xl font-bold tracking-tight text-[#1C1C1C] leading-snug">
                Handle the "unhappy paths": mismatch & missing records
              </h3>
              <p className="text-lg md:text-[20px] text-[#5F5F5F] leading-relaxed">
                Document management breaks down when files are silently modified. NotaryVault flags single-character changes and unauthorized stamp revisions instantly with clear, actionable diagnostics.
              </p>
            </div>
          </div>

          {/* Card 3: Text Left, Visual Right */}
          <div className="bg-[#FCFBF8] border border-black/[0.06] rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center p-8 md:p-12 lg:p-16 gap-10">
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-3xl md:text-4xl font-bold tracking-tight text-[#1C1C1C] leading-snug">
                Structured classification & step workflows
              </h3>
              <p className="text-lg md:text-[20px] text-[#5F5F5F] leading-relaxed">
                Onboard legal deeds, tenancy agreements, and powers of attorney through a guided sequence. Standardize metadata schema fields before registering verification baselines.
              </p>
            </div>
            <div className="lg:col-span-7 flex justify-end">
              <div className="w-full max-w-[620px] h-[360px] md:h-[400px] rounded-3xl bg-gradient-to-tr from-[#3B82F6] via-[#60A5FA] to-[#E0F2FE] p-6 relative overflow-hidden flex items-end justify-end shadow-inner">
                <OnboardingStepMiniUI />
              </div>
            </div>
          </div>

          {/* Card 4: Visual Left, Text Right (Alternating) */}
          <div className="bg-[#FCFBF8] border border-black/[0.06] rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center p-8 md:p-12 lg:p-16 gap-10">
            <div className="lg:col-span-7 order-2 lg:order-1 flex justify-start">
              <div className="w-full max-w-[620px] h-[360px] md:h-[400px] rounded-3xl bg-gradient-to-tr from-[#0B1220] via-[#1E293B] to-[#3B6EF5] p-6 relative overflow-hidden flex items-end justify-start shadow-inner">
                <DarkDashboardMiniUI />
              </div>
            </div>
            <div className="lg:col-span-5 order-1 lg:order-2 space-y-4">
              <h3 className="text-3xl md:text-4xl font-bold tracking-tight text-[#1C1C1C] leading-snug">
                Model permissions and access governance
              </h3>
              <p className="text-lg md:text-[20px] text-[#5F5F5F] leading-relaxed">
                Control document sharing with time-limited references and instant access revocation. Keep external parties informed without compromising core repository confidentiality.
              </p>
            </div>
          </div>

          {/* Card 5: Text Left, Visual Right */}
          <div className="bg-[#FCFBF8] border border-black/[0.06] rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center p-8 md:p-12 lg:p-16 gap-10">
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-3xl md:text-4xl font-bold tracking-tight text-[#1C1C1C] leading-snug">
                Transparent knowledge & public verification QR
              </h3>
              <p className="text-lg md:text-[20px] text-[#5F5F5F] leading-relaxed">
                Generate clean, shareable QR codes that resolve to public verification snapshots. Inspect registration timestamps and hash fragments without ever revealing sensitive personal information.
              </p>
            </div>
            <div className="lg:col-span-7 flex justify-end">
              <div className="w-full max-w-[620px] h-[360px] md:h-[400px] rounded-3xl bg-gradient-to-tr from-[#FF2E88] via-[#8B7BF0] to-[#E9D5FF] p-6 relative overflow-hidden flex items-end justify-end shadow-inner">
                <PinkSidebarResourceMiniUI />
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
