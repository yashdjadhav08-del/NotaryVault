import React from 'react';
import { Check } from 'lucide-react';

export interface OptionRowProps {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const OptionRow: React.FC<OptionRowProps> = ({
  label,
  description,
  selected,
  onClick,
  icon,
  disabled = false,
  className = '',
}) => {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left flex items-center justify-between p-3.5 rounded-xl border transition-all duration-150 ${
        selected
          ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-sm'
          : 'bg-white hover:bg-stone-50/80 text-[#1C1C1C] border-black/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`shrink-0 ${selected ? 'text-white' : 'text-stone-500'}`}>
            {icon}
          </div>
        )}
        <div>
          <div className="text-sm font-medium leading-snug">{label}</div>
          {description && (
            <div className={`text-xs mt-0.5 ${selected ? 'text-stone-300' : 'text-stone-500'}`}>
              {description}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 ml-3">
        {selected ? (
          <div className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center">
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border border-black/20" />
        )}
      </div>
    </button>
  );
};
