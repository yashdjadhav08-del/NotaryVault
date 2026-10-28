import React from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { useDocuments } from '../../context/DocumentContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useDocuments();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const icon = {
          success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
          info: <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />,
          warning: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
          error: <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />,
        }[toast.type];

        const bgBorder = {
          success: 'bg-white border-emerald-200 shadow-lg shadow-emerald-500/5',
          info: 'bg-white border-blue-200 shadow-lg shadow-blue-500/5',
          warning: 'bg-white border-amber-200 shadow-lg shadow-amber-500/5',
          error: 'bg-white border-rose-200 shadow-lg shadow-rose-500/5',
        }[toast.type];

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border ${bgBorder} transition-all duration-300 animate-in slide-in-from-bottom-2`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-[#1C1C1C] uppercase tracking-wide">
                {toast.title}
              </h4>
              <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-md"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
