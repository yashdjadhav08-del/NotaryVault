import React from 'react';
import { Accordion } from '../ui/Accordion';
import type { AccordionItem } from '../ui/Accordion';

export const FaqSection: React.FC = () => {
  const faqItems: AccordionItem[] = [
    {
      id: 'faq-1',
      question: 'Does NotaryVault store my documents on a blockchain?',
      answer: (
        <div>
          <p>
            No. In this frontend demonstration, files are processed exclusively within your browser using the standard Web Cryptography API (<code className="bg-stone-100 px-1 py-0.5 rounded text-xs font-mono">crypto.subtle.digest</code>) to compute a SHA-256 fingerprint. No raw files are ever transmitted to a server or stored on-chain.
          </p>
          <p className="mt-2 text-stone-500 text-sm">
            In future planned phases, only the 64-character hash digest, timestamp, and verification status references will be committed to decentralized testnets (such as Ethereum Sepolia).
          </p>
        </div>
      ),
    },
    {
      id: 'faq-2',
      question: 'Does a verified result prove legal ownership?',
      answer: (
        <div>
          <p>
            No. A verified result indicates solely that the cryptographic hash of the inspected file matches the fingerprint registered in the catalog.
          </p>
          <p className="mt-2 text-stone-500 text-sm">
            Cryptographic integrity is not a substitute for official title certification, statutory land registry deeds, or authorized commissioner notarization.
          </p>
        </div>
      ),
    },
    {
      id: 'faq-3',
      question: 'What does the public QR code show?',
      answer: (
        <div>
          <p>
            The QR code points directly to a stripped public verification card (<code className="bg-stone-100 px-1 py-0.5 rounded text-xs font-mono">/verify/:documentId</code>). It displays only the Document ID, document classification, timestamp, demo verification badge, and truncated hash.
          </p>
          <p className="mt-2 text-stone-500 text-sm">
            It strictly never exposes document contents, confidential contract terms, or sensitive personal identity records.
          </p>
        </div>
      ),
    },
    {
      id: 'faq-4',
      question: 'Is document sharing really secure in this demo?',
      answer: (
        <div>
          <p>
            Sharing in this prototype is simulated to illustrate the operational workflow and timeline audit logging. No actual emails are sent, and real asymmetric key encryption is not yet active.
          </p>
        </div>
      ),
    },
    {
      id: 'faq-5',
      question: 'What will change when blockchain is integrated?',
      answer: (
        <div>
          <p>
            Planned future integrations include Solidity smart contracts deployed on Ethereum Sepolia, wallet authorization via MetaMask/ethers.js, and decentralized storage indexers.
          </p>
          <p className="mt-2 text-stone-500 text-sm">
            Even with smart contracts active, raw document files will always remain off-chain in controlled storage to guarantee document privacy and GDPR compliance.
          </p>
        </div>
      ),
    },
  ];

  return (
    <section id="faq" className="w-full py-20 md:py-28 px-6 md:px-12 lg:px-20 bg-[#F7F4ED]">
      <div className="max-w-[760px] mx-auto">
        
        {/* Centered Two-line Heading matching screenshot 2 & 5 */}
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl md:text-[64px] font-extrabold text-[#1C1C1C] tracking-tighter leading-[1.08]">
            Frequently asked<br />questions
          </h2>
        </div>

        {/* Centered 720px wide Accordion */}
        <Accordion items={faqItems} defaultOpenId="faq-1" />

      </div>
    </section>
  );
};
