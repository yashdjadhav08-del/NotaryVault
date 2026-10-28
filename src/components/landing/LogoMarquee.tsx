import React, { useState } from 'react';
import { Pause, Play } from 'lucide-react';

export const LogoMarquee: React.FC = () => {
  const [isPaused, setIsPaused] = useState(false);

  const techWordmarks = [
    { name: 'Solidity', font: 'font-mono tracking-wider font-bold text-2xl' },
    { name: 'Ethereum Sepolia', font: 'font-serif tracking-tight font-semibold text-2xl italic' },
    { name: 'MetaMask (Planned)', font: 'font-sans font-extrabold tracking-tight text-2xl' },
    { name: 'ethers.js', font: 'font-mono lowercase text-2xl font-bold tracking-tighter' },
    { name: 'WebCrypto SHA-256', font: 'font-mono uppercase text-2xl font-black tracking-widest' },
    { name: 'Client Hash Verification', font: 'font-sans text-2xl font-bold tracking-tight' },
  ];

  return (
    <div className="w-full py-12 border-y border-black/[0.06] bg-[#FCFBF8]/60 overflow-hidden relative">
      <div className="max-w-[1660px] mx-auto px-6 md:px-12 lg:px-20 mb-4 flex items-center justify-between">
        <span className="text-xs uppercase font-bold tracking-widest text-stone-400">
          Planned Technology Stack & Cryptographic Standards
        </span>
        <button
          onClick={() => setIsPaused(!isPaused)}
          className="p-1.5 rounded-lg border border-black/10 bg-white hover:bg-stone-100 text-stone-700 transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
          aria-label={isPaused ? "Play marquee" : "Pause marquee"}
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          <span>{isPaused ? 'Resume' : 'Pause'}</span>
        </button>
      </div>

      <div className="relative w-full overflow-hidden flex">
        <div className={`animate-marquee ${isPaused ? 'paused' : ''} flex items-center gap-16 md:gap-24 whitespace-nowrap`}>
          {techWordmarks.concat(techWordmarks).map((item, idx) => (
            <div 
              key={idx} 
              className={`text-[#1C1C1C]/70 hover:text-black transition-colors select-none ${item.font}`}
            >
              {item.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
