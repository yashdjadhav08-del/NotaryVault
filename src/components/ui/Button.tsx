import React, { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary-landing' | 'primary-app' | 'secondary' | 'ghost' | 'danger' | 'outline-navy';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  className = '',
  variant = 'primary-landing',
  size = 'md',
  loading = false,
  disabled,
  icon,
  children,
  ...props
}, ref) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.99] cursor-pointer';

  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5 rounded-lg gap-1.5',
    md: 'text-sm px-4 py-2.5 rounded-xl gap-2',
    lg: 'text-base px-6 py-3.5 rounded-xl gap-2.5',
  }[size];

  const variantClasses = {
    'primary-landing': 'bg-[#0A0A0A] hover:bg-[#202020] text-white focus-visible:ring-black shadow-sm',
    'primary-app': 'bg-[#1F6FF0] hover:bg-[#1658C7] text-white focus-visible:ring-[#1F6FF0] shadow-sm',
    'secondary': 'bg-white hover:bg-stone-50 text-[#1C1C1C] border border-black/10 focus-visible:ring-stone-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
    'ghost': 'bg-transparent hover:bg-black/5 text-[#1C1C1C] focus-visible:ring-black/20',
    'danger': 'bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-500 shadow-sm',
    'outline-navy': 'bg-transparent border border-white/20 text-white hover:bg-white/10 focus-visible:ring-white',
  }[variant];

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
});

Button.displayName = 'Button';
