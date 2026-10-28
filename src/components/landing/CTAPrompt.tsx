import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Mic, ChevronDown, ArrowRight, ShieldCheck, FileUp } from 'lucide-react';
import { useDocuments } from '../../context/DocumentContext';

export const CTAPrompt: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useDocuments();
  const [docQuery, setDocQuery] = useState('');
  const [actionType, setActionType] = useState<'verify' | 'register'>('verify');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (actionType === 'register') {
      navigate('/app/register');
      return;
    }

    if (!docQuery.trim()) {
      navigate('/app/verify');
      return;
    }

    navigate(`/app/verify?id=${encodeURIComponent(docQuery.trim())}`);
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addToast('File Selected', `Ready to verify ${file.name}. Transferring to verification lab...`);
      navigate('/app/verify');
    }
  };

  return (
    <section className="relative w-full pt-20 pb-32 px-6 md:px-12 lg:px-20 overflow-hidden bg-gradient-to-b from-[#F7F4ED] via-[#DCEBFF] to-[#FFD6EA]">
      <div className="max-w-[1660px] mx-auto text-center relative z-10">
        
        {/* Heading */}
        <h2 className="text-4xl md:text-5xl lg:text-[54px] font-extrabold text-[#1C1C1C] tracking-tighter mb-10 leading-tight">
          Ready to bring certainty to your documents?
        </h2>

        {/* Wide Rounded Prompt Box matching screenshot 1 & 7 */}
        <div className="max-w-[760px] mx-auto">
          <form 
            onSubmit={handleSubmit}
            className="bg-white rounded-[32px] p-4 md:p-6 shadow-soft-prompt border border-black/[0.08] text-left transition-shadow hover:shadow-2xl"
          >
            {/* Hidden file input triggered by '+' button */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFilePicked} 
              className="hidden" 
              accept=".pdf,.png,.jpg,.jpeg"
            />

            {/* Input area */}
            <div className="px-2 pt-1 pb-3">
              <input
                type="text"
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                placeholder={
                  actionType === 'verify' 
                    ? "Enter Document ID to verify..."
                    : "Enter document title to begin registration..."
                }
                className="w-full text-base md:text-lg text-[#1C1C1C] placeholder:text-[#8C8C8C] bg-transparent border-none outline-none focus:ring-0"
              />
            </div>

            {/* Bottom Controls Row */}
            <div className="flex items-center justify-between pt-3 border-t border-black/[0.06] mt-2">
              
              {/* '+' button on the left (opens file picker) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center text-stone-700 hover:bg-stone-100 hover:text-black transition-colors cursor-pointer"
                title="Select document file from device"
                aria-label="Upload document file"
              >
                <Plus className="w-5 h-5 stroke-[2]" />
              </button>

              {/* Right Side: Mode Dropdown + Mic + Submit */}
              <div className="flex items-center gap-2">
                
                {/* Dropdown switch */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-sm font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200/80 transition-colors cursor-pointer"
                  >
                    <span>{actionType === 'verify' ? 'Verify' : 'Register'}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-stone-600" />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 bottom-full mb-2 w-48 bg-white border border-black/10 rounded-2xl shadow-xl p-1.5 space-y-1 z-20">
                      <button
                        type="button"
                        onClick={() => {
                          setActionType('verify');
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 ${
                          actionType === 'verify' ? 'bg-[#0A0A0A] text-white' : 'hover:bg-stone-50 text-stone-700'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Verify Record</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActionType('register');
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 ${
                          actionType === 'register' ? 'bg-[#0A0A0A] text-white' : 'hover:bg-stone-50 text-stone-700'
                        }`}
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        <span>Register Deed</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Mic Icon */}
                <button
                  type="button"
                  disabled
                  title="Voice lookup disabled"
                  className="w-10 h-10 rounded-full text-stone-400 cursor-not-allowed flex items-center justify-center opacity-60"
                  aria-label="Voice search disabled"
                >
                  <Mic className="w-5 h-5 stroke-[1.75]" />
                </button>

                {/* Submit arrow button */}
                <button
                  type="submit"
                  className="w-10 h-10 rounded-full bg-[#0A0A0A] hover:bg-stone-800 text-white flex items-center justify-center transition-transform hover:scale-105 shadow-sm"
                  aria-label="Submit query"
                >
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>

              </div>
            </div>
          </form>
        </div>

      </div>
    </section>
  );
};
