import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { useWallet } from '../context/WalletContext';
import { useAuthors } from '../context/AuthorContext';
import { formatDate } from '../lib/format';
import { 
  UserCheck, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  FileBadge,
  Send
} from 'lucide-react';

export const ApplyAuthorPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    address, 
    status: walletStatus, 
    connectWallet, 
    isAuthor,
    isSuperAuthor, 
    isSecondaryAuthor,
    provider
  } = useWallet();
  const { 
    submitApplication, 
    getApplicationByWallet, 
    isApplicantPending 
  } = useAuthors();

  const [applicantName, setApplicantName] = useState('');
  const [organization, setOrganization] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [justification, setJustification] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingApp = getApplicationByWallet(address);
  const isPending = isApplicantPending(address);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!applicantName.trim()) errs.applicantName = 'Full name is required';
    if (!organization.trim()) errs.organization = 'Organization / Registry office is required';
    if (!licenseNumber.trim()) errs.licenseNumber = 'Professional license or Bar registration ID is required';
    if (!contactEmail.trim() || !contactEmail.includes('@')) errs.contactEmail = 'Valid email is required for notification';
    if (!justification.trim() || justification.trim().length < 20) {
      errs.justification = 'Please provide at least 20 characters explaining your notary/conveyance authority';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      await submitApplication({
        applicantName,
        organization,
        licenseNumber,
        contactEmail,
        justification,
      }, provider);
    } catch {
      // Toast handles error display
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Author Application"
      subtitle="Apply to become an authorized Secondary Author for notary document registration."
    >
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Wallet Connection Guard */}
        {walletStatus !== 'connected' && (
          <Card className="p-6 bg-blue-50/70 border border-blue-200 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-[#1F6FF0] flex items-center justify-center mx-auto">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-blue-950">
                Connect Wallet to Apply
              </h3>
              <p className="text-xs text-blue-800 max-w-md mx-auto mt-1">
                Your wallet address is used as the cryptographic identifier for author credentials and permission management.
              </p>
            </div>
            <Button
              variant="primary-app"
              size="md"
              onClick={connectWallet}
              className="mx-auto"
            >
              Connect Wallet
            </Button>
          </Card>
        )}

        {/* Status: Already Super Author */}
        {isSuperAuthor && (
          <Card className="p-6 bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-950">
                  Super Author Account Detected
                </h3>
                <p className="text-emerald-800 mt-0.5">
                  You are connected with the root Super Author wallet. You have full administrative privileges to register documents and review Secondary Author applications.
                </p>
              </div>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="primary-app"
                size="sm"
                onClick={() => navigate('/app/author-applications')}
              >
                Review Applications
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/app/register')}
              >
                Register Documents
              </Button>
            </div>
          </Card>
        )}

        {/* Status: Already Authorized Secondary Author */}
        {isSecondaryAuthor && !isSuperAuthor && (
          <Card className="p-6 bg-blue-50/70 border border-blue-200 text-xs text-blue-900 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#1F6FF0] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-blue-950">
                  Active Secondary Author
                </h3>
                <p className="text-blue-800 mt-0.5">
                  Your wallet is an authorized Secondary Author. You have permission to register documents and compute cryptographic SHA-256 integrity fingerprints.
                </p>
              </div>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="primary-app"
                size="sm"
                onClick={() => navigate('/app/register')}
              >
                Go to Document Registration
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/app/authors')}
              >
                View Author Directory
              </Button>
            </div>
          </Card>
        )}

        {/* Status: Application Pending Review */}
        {existingApp && isPending && (
          <Card className="p-6 bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-amber-200/60">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-amber-600" />
                <span className="font-bold text-amber-950 text-sm">
                  Application Pending Review ({existingApp.id})
                </span>
              </div>
              <span className="px-2 py-0.5 bg-amber-200/70 text-amber-950 rounded-full font-semibold font-mono text-[11px]">
                Pending Super Author
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-amber-800/80 font-medium block">Applicant Name</span>
                <span className="font-bold text-amber-950">{existingApp.applicantName}</span>
              </div>
              <div>
                <span className="text-amber-800/80 font-medium block">Organization</span>
                <span className="font-bold text-amber-950">{existingApp.organization}</span>
              </div>
              <div>
                <span className="text-amber-800/80 font-medium block">License ID</span>
                <span className="font-bold font-mono text-amber-950">{existingApp.licenseNumber}</span>
              </div>
              <div>
                <span className="text-amber-800/80 font-medium block">Submitted</span>
                <span className="font-bold text-amber-950">{formatDate(existingApp.submittedAt)}</span>
              </div>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed pt-1">
              Your application has been received and is queued for verification by the Super Author. Once approved, your wallet address will automatically receive document registration permissions.
            </p>
          </Card>
        )}

        {/* Status: Application Rejected */}
        {existingApp && existingApp.status === 'Rejected' && !isPending && (
          <Card className="p-6 bg-red-50/70 border border-red-200 text-xs text-red-900 space-y-3">
            <div className="flex items-center gap-2.5">
              <XCircle className="w-5 h-5 text-red-600" />
              <span className="font-bold text-red-950 text-sm">
                Previous Application ({existingApp.id}) Rejected
              </span>
            </div>
            {existingApp.reviewNotes && (
              <div className="p-3 bg-white/70 rounded-xl border border-red-200">
                <span className="font-bold block mb-0.5">Reviewer Feedback:</span>
                <p className="text-stone-700">{existingApp.reviewNotes}</p>
              </div>
            )}
            <p className="text-[11px] text-red-800">
              You may submit a revised application below with updated credentials or official documentation.
            </p>
          </Card>
        )}

        {/* Application Submission Form */}
        {(!existingApp || existingApp.status === 'Rejected') && !isAuthor && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="p-6 md:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1C] flex items-center gap-2">
                  <FileBadge className="w-5 h-5 text-[#1F6FF0]" />
                  <span>Applicant Credentials & Organization</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Provide verified notary or official land title registry credentials for authorization.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Full Legal Name *"
                  placeholder="e.g. Adv. Rajesh M. Sharma"
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  error={errors.applicantName}
                />

                <Input
                  label="Organization / Registry Office *"
                  placeholder="e.g. Sub-Registrar Office, Mumbai Ward C"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  error={errors.organization}
                />

                <Input
                  label="Professional License / Bar Registration ID *"
                  placeholder="e.g. BAR/2019/MH/88421"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  error={errors.licenseNumber}
                />

                <Input
                  type="email"
                  label="Official Contact Email *"
                  placeholder="notary@office.gov.in"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  error={errors.contactEmail}
                />

                <div className="md:col-span-2">
                  <Textarea
                    label="Justification & Jurisdictional Scope *"
                    placeholder="Describe your legal conveyancing or notary authority, district jurisdiction, and expected document registration volume..."
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    rows={4}
                    error={errors.justification}
                  />
                </div>
              </div>

              {/* Data Privacy & Super Author Review Disclosure */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 text-xs text-stone-600 space-y-1">
                <span className="font-bold text-stone-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-stone-700" />
                  <span>Credential Confidentiality Notice</span>
                </span>
                <p className="text-[11px] leading-relaxed">
                  Application credentials are strictly accessible to the Super Author for administrative review. Personal contact info is never exposed on public verification links or public blockchain remark logs.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => navigate('/app')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary-app"
                  size="md"
                  loading={isSubmitting}
                  disabled={walletStatus !== 'connected'}
                  icon={<Send className="w-4 h-4" />}
                >
                  Submit Application
                </Button>
              </div>
            </Card>
          </form>
        )}

      </div>
    </AppShell>
  );
};
