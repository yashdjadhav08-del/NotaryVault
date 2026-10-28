import React, { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  icon,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full bg-white text-[#1C1C1C] placeholder:text-stone-400 text-sm rounded-xl border transition-all duration-150 py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0] ${
            icon ? 'pl-10' : ''
          } ${
            error 
              ? 'border-red-400 focus:border-red-500 focus:ring-red-100' 
              : 'border-black/15 hover:border-black/25'
          } ${className}`}
          {...props}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-stone-500">{helperText}</p>
      ) : null}
    </div>
  );
});

Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  helperText,
  className = '',
  id,
  rows = 3,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={`w-full bg-white text-[#1C1C1C] placeholder:text-stone-400 text-sm rounded-xl border transition-all duration-150 py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-[#1F6FF0]/20 focus:border-[#1F6FF0] ${
          error 
            ? 'border-red-400 focus:border-red-500 focus:ring-red-100' 
            : 'border-black/15 hover:border-black/25'
        } ${className}`}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xs text-red-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-stone-500">{helperText}</p>
      ) : null}
    </div>
  );
});

Textarea.displayName = 'Textarea';
