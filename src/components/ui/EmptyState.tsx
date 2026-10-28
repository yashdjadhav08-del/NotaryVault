import React from 'react';
import { FileQuestion } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-12 rounded-3xl bg-white border border-black/[0.06] ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-500 mb-4">
        {icon || <FileQuestion className="w-7 h-7 stroke-[1.5]" />}
      </div>
      <h3 className="text-lg font-bold text-[#1C1C1C] mb-1">
        {title}
      </h3>
      <p className="text-sm text-stone-500 max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary-app" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => {
  return <div className={`animate-pulse bg-stone-200/70 rounded-md ${className}`} />;
};
