import React from 'react';
import { LandingNav } from '../components/layout/LandingNav';
import { Hero } from '../components/landing/Hero';
import { LogoMarquee } from '../components/landing/LogoMarquee';
import { FeatureStack } from '../components/landing/FeatureStack';
import { CTAPrompt } from '../components/landing/CTAPrompt';
import { FaqSection } from '../components/landing/FaqSection';
import { LandingFooter } from '../components/layout/LandingFooter';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F7F4ED] text-[#1C1C1C] flex flex-col selection:bg-[#3B6EF5] selection:text-white">
      {/* Sticky Top Navigation */}
      <LandingNav />

      {/* Main Sections */}
      <main className="flex-1">
        {/* A. Hero with 6 Selection Box Decorations */}
        <Hero />

        {/* B. Planned Tech Stack Wordmark Marquee */}
        <LogoMarquee />

        {/* C. "Records Aren't Enough" Alternating Feature Stack with Inset Cropped Mini-UIs */}
        <FeatureStack />

        {/* D. "Ready to bring certainty?" Quick Verify CTA Box over Gradient Background */}
        <CTAPrompt />

        {/* E. Frequently Asked Questions Accordion */}
        <FaqSection />
      </main>

      {/* F. 5-Column Large Rounded Footer */}
      <LandingFooter />
    </div>
  );
};
