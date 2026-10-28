import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ArrowLeft, Home, FileQuestion } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F7F4ED] text-[#1C1C1C] flex flex-col justify-between p-6 md:p-12 selection:bg-[#3B6EF5] selection:text-white">
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between pb-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF2E88] via-[#8B7BF0] to-[#1F6FF0] flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-[#1C1C1C]">
            NotaryVault
          </span>
        </Link>
      </header>

      <main className="max-w-md mx-auto w-full text-center space-y-6 my-auto">
        <div className="w-20 h-20 rounded-3xl bg-stone-200/70 text-stone-500 flex items-center justify-center mx-auto">
          <FileQuestion className="w-10 h-10" />
        </div>

        <div>
          <span className="text-xs font-mono font-bold text-stone-400 tracking-widest uppercase block mb-1">
            HTTP 404
          </span>
          <h1 className="text-3xl font-extrabold text-[#1C1C1C] tracking-tight">
            Page Not Found
          </h1>
          <p className="text-sm text-stone-500 mt-2 leading-relaxed">
            The destination URL does not exist or has been relocated within the prototype catalog.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Link to="/">
            <Button variant="secondary" size="md" icon={<Home className="w-4 h-4" />}>
              Landing Page
            </Button>
          </Link>
          <Link to="/app">
            <Button variant="primary-landing" size="md" icon={<ArrowLeft className="w-4 h-4" />}>
              Open NotaryVault
            </Button>
          </Link>
        </div>
      </main>

      <footer className="max-w-4xl mx-auto w-full pt-8 text-center text-xs text-stone-400">
        NotaryVault Prototype Navigation
      </footer>
    </div>
  );
};
