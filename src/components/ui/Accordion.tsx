import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface AccordionItem {
  id: string;
  question: string;
  answer: string | React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  defaultOpenId?: string;
  className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({
  items,
  defaultOpenId,
  className = '',
}) => {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId || null);

  const toggleItem = (id: string) => {
    setOpenId(prev => (prev === id ? null : id));
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {items.map(item => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="bg-[#FCFBF8] border border-black/[0.08] rounded-[20px] overflow-hidden transition-all duration-200"
          >
            <button
              type="button"
              onClick={() => toggleItem(item.id)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${item.id}`}
              className="w-full text-left p-6 md:p-7 flex items-center justify-between gap-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              <span className="text-lg md:text-[21px] font-semibold text-[#1C1C1C] leading-snug">
                {item.question}
              </span>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-stone-600 transition-transform duration-300 ${
                  isOpen ? 'rotate-180 text-black' : ''
                }`}
              >
                <ChevronDown className="w-5 h-5 stroke-[1.75]" />
              </div>
            </button>
            {isOpen && (
              <div
                id={`faq-answer-${item.id}`}
                className="px-6 md:px-7 pb-6 pt-1 text-base md:text-[17px] text-[#5F5F5F] leading-relaxed border-t border-black/[0.04]"
              >
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
