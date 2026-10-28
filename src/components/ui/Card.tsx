import React from 'react';
import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'white' | 'cream' | 'navy' | 'ghost';
  rounded?: 'xl' | '2xl' | '3xl' | '4xl';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'white',
  rounded = '2xl',
  className = '',
  ...props
}) => {
  const roundedClass = {
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
    '4xl': 'rounded-4xl',
  }[rounded];

  const variantClass = {
    white: 'bg-white border border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.02)]',
    cream: 'bg-[#FCFBF8] border border-black/[0.06] shadow-none',
    navy: 'bg-[#0B1220] border border-white/10 text-white',
    ghost: 'bg-transparent border border-black/10',
  }[variant];

  return (
    <div className={`${roundedClass} ${variantClass} ${className}`} {...props}>
      {children}
    </div>
  );
};
