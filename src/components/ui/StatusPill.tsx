import React from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  HelpCircle, 
  Share2, 
  Ban,
  FileCheck2
} from 'lucide-react';
import type { DocumentStatus, AccessStatus, VerificationState } from '../../types';

export interface StatusPillProps {
  status: DocumentStatus | AccessStatus | VerificationState | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ 
  status, 
  size = 'md',
  className = '' 
}) => {
  const norm = status.toLowerCase();

  let label = status;
  let bgClass = 'bg-stone-100 text-stone-700 border-stone-200';
  let icon = <HelpCircle className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />;

  if (norm.includes('verif') && !norm.includes('pend') && !norm.includes('un')) {
    label = 'Verified';
    bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
    icon = <CheckCircle2 className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-emerald-600`} />;
  } else if (norm.includes('pend')) {
    label = 'Pending Review';
    bgClass = 'bg-amber-50 text-amber-800 border-amber-200/80';
    icon = <Clock className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-amber-600`} />;
  } else if (norm.includes('mismatch')) {
    label = 'Hash Mismatch';
    bgClass = 'bg-rose-50 text-rose-800 border-rose-200/80';
    icon = <AlertTriangle className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-rose-600`} />;
  } else if (norm.includes('not_found') || norm.includes('not found')) {
    label = 'Not Found';
    bgClass = 'bg-stone-100 text-stone-700 border-stone-200/90';
    icon = <HelpCircle className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-stone-500`} />;
  } else if (norm.includes('registered')) {
    label = 'Registered (Demo)';
    bgClass = 'bg-blue-50 text-blue-800 border-blue-200/80';
    icon = <FileCheck2 className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-blue-600`} />;
  } else if (norm.includes('active')) {
    label = 'Active';
    bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
    icon = <CheckCircle2 className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-emerald-600`} />;
  } else if (norm.includes('expired')) {
    label = 'Expired';
    bgClass = 'bg-stone-100 text-stone-600 border-stone-200';
    icon = <Clock className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-stone-500`} />;
  } else if (norm.includes('revoked')) {
    label = 'Revoked';
    bgClass = 'bg-rose-50 text-rose-700 border-rose-200';
    icon = <Ban className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-rose-500`} />;
  } else if (norm.includes('shared')) {
    label = 'Shared';
    bgClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
    icon = <Share2 className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-indigo-600`} />;
  }

  const sizeClasses = size === 'sm' 
    ? 'text-[11px] px-2 py-0.5 gap-1 font-medium' 
    : 'text-xs px-2.5 py-1 gap-1.5 font-medium';

  return (
    <span className={`inline-flex items-center rounded-full border ${sizeClasses} ${bgClass} shrink-0 select-none ${className}`}>
      {icon}
      <span>{label}</span>
    </span>
  );
};
