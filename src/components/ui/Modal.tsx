import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

let activeModalCount = 0;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'md',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    activeModalCount++;
    if (activeModalCount === 1) {
      document.body.style.overflow = 'hidden';
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      activeModalCount = Math.max(0, activeModalCount - 1);
      if (activeModalCount === 0) {
        document.body.style.overflow = '';
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 overscroll-contain"
    >
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 transition-opacity" 
        onClick={onClose} 
      />

      {/* Centering wrapper that allows natural scrolling without cutting off the top on short viewports */}
      <div className="min-h-full flex items-center justify-center pointer-events-none">
        {/* Modal Dialog */}
        <div
          ref={modalRef}
          className={`relative w-full ${maxWidthClass} bg-white rounded-3xl border border-black/10 shadow-2xl p-6 md:p-8 z-10 my-auto pointer-events-auto max-h-[calc(100vh-3rem)] sm:max-h-[calc(100vh-4rem)] flex flex-col`}
        >
          <div className="flex items-start justify-between pb-4 border-b border-black/5 shrink-0">
            <div>
              <h2 id="modal-title" className="text-xl font-bold tracking-tight text-[#1C1C1C]">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors focus:outline-none focus:ring-2 focus:ring-black cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-5 overflow-y-auto flex-1 overscroll-contain pr-1 -mr-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
