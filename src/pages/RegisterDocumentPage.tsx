import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { OptionRow } from '../components/ui/OptionRow';
import { StatusPill } from '../components/ui/StatusPill';
import { Modal } from '../components/ui/Modal';
import { useDocuments } from '../context/DocumentContext';
import { useWallet } from '../context/WalletContext';
import { 
  isContractConfigured, 
  getExplorerTxUrl, 
  getExplorerAddressUrl,
  verifyContractCapabilities
} from '../services/contractService';
import type { DocumentType, DocumentRecord } from '../types';
import { 
  UploadCloud, 
  FileCheck2, 
  Trash2, 
  Copy, 
  Check, 
  ShieldCheck, 
  ShieldAlert,
  Info,
  ExternalLink,
  AlertTriangle,
  ArrowRightLeft,
  Flame,
  RefreshCw,
  FileText,
  Download,
  Mail,
  Bell
} from 'lucide-react';
import { formatFileSize } from '../lib/format';
import { buildPublicVerificationUrl } from '../lib/qr';
import { generateDocumentId } from '../lib/id';
import { areSha256HashesEqual, normalizeSha256 } from '../lib/hash';
import { validatePdfFile, PDF_SIZE_NOTICE } from '../lib/pdfValidator';
import { 
  LOCAL_STORAGE_DISCLAIMER, 
  downloadLocalPDF, 
  dispatchDocumentNotifications, 
  getLocalPDF, 
  uploadPdfToServer,
  saveLocalPDF,
  computeSha256,
  checkServerDocument,
  syncAndVerifyPdfForRetry
} from '../lib/pdfStorage';
import { downloadDocumentReceipt } from '../lib/receipt';


export const RegisterDocumentPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    documents,
    registerDocument, 
    addToast, 
    checkPropertyConflicts,
    checkDocumentIdAvailability,
    generateAvailableDocumentId
  } = useDocuments();
  const { 
    status: walletStatus, 
    address: walletAddress,
    provider, 
    selectedNetwork, 
    activeNetworkConfig, 
    isCorrectNetwork, 
    switchNetworkToMST,
    isAuthor,
  } = useWallet();

  // Form State
  const [documentId, setDocumentId] = useState('');
  const [isGeneratingId, setIsGeneratingId] = useState(false);
  const [idChecking, setIdChecking] = useState(false);
  const [idCheckStatus, setIdCheckStatus] = useState<{ available?: boolean; error?: string; warning?: string } | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<DocumentType>('Property Deed');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [notificationConsent, setNotificationConsent] = useState(false);
  const [notificationResult, setNotificationResult] = useState<any>(null);
  const [isRetryingEmail, setIsRetryingEmail] = useState(false);
  const [retryRecipientEmail, setRetryRecipientEmail] = useState('');
  const [isPdfRecoveryNeeded, setIsPdfRecoveryNeeded] = useState(false);
  const [isRecoveringFile, setIsRecoveringFile] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const recoveryFileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{ pageCount?: number; version?: string } | null>(null);
  const [precalculatedHash, setPrecalculatedHash] = useState<string | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hashingProgress, setHashingProgress] = useState<string>('');

  // Status & Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredResult, setRegisteredResult] = useState<DocumentRecord | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Pre-signing Review Modal State
  const [preSignModalOpen, setPreSignModalOpen] = useState(false);

  // Mainnet Confirmation Dialog State
  const [mainnetConfirmOpen, setMainnetConfirmOpen] = useState(false);
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const idValidationSeqRef = useRef<number>(0);

  // Initialize unique candidate Document ID verified against active & historical registries
  React.useEffect(() => {
    let active = true;
    const seq = ++idValidationSeqRef.current;
    setIsGeneratingId(true);
    generateAvailableDocumentId(selectedNetwork)
      .then(async (id) => {
        if (active && seq === idValidationSeqRef.current) {
          setDocumentId(id);
          const availability = await checkDocumentIdAvailability(id, selectedNetwork);
          if (active && seq === idValidationSeqRef.current) {
            if (!availability.available) {
              const errMsg = availability.reason || 'Document ID is not available.';
              setIdCheckStatus({ available: false, error: errMsg });
              setErrors(prev => ({ ...prev, documentId: errMsg }));
            } else {
              setIdCheckStatus({ available: true, warning: availability.warning });
              setErrors(prev => {
                const copy = { ...prev };
                delete copy.documentId;
                return copy;
              });
            }
          }
        }
      })
      .catch(() => {
        if (active && seq === idValidationSeqRef.current) {
          const fallback = generateDocumentId();
          setDocumentId(fallback);
          setIdCheckStatus({ available: true });
        }
      })
      .finally(() => {
        if (active && seq === idValidationSeqRef.current) {
          setIsGeneratingId(false);
        }
      });
    return () => { active = false; };
  }, [selectedNetwork]);

  const handleGenerateNewId = async () => {
    const seq = ++idValidationSeqRef.current;
    setIsGeneratingId(true);
    setIdCheckStatus(null);
    setErrors(prev => {
      const copy = { ...prev };
      delete copy.documentId;
      return copy;
    });
    try {
      const newCand = await generateAvailableDocumentId(selectedNetwork);
      if (seq !== idValidationSeqRef.current) return;
      setDocumentId(newCand);
      const availability = await checkDocumentIdAvailability(newCand, selectedNetwork);
      if (seq !== idValidationSeqRef.current) return;
      if (!availability.available) {
        const errMsg = availability.reason || 'Document ID is not available.';
        setIdCheckStatus({ available: false, error: errMsg });
        setErrors(prev => ({ ...prev, documentId: errMsg }));
      } else {
        setIdCheckStatus({ available: true, warning: availability.warning });
        setErrors(prev => {
          const copy = { ...prev };
          delete copy.documentId;
          return copy;
        });
      }
    } catch {
      if (seq !== idValidationSeqRef.current) return;
      const fallback = generateDocumentId();
      setDocumentId(fallback);
      setIdCheckStatus({ available: true });
    } finally {
      if (seq === idValidationSeqRef.current) {
        setIsGeneratingId(false);
      }
    }
  };

  const handleDocumentIdChange = async (val: string) => {
    const seq = ++idValidationSeqRef.current;
    setDocumentId(val);

    // Immediately clear previous duplicate error and status when user edits the ID
    setErrors(prev => {
      if (!prev.documentId) return prev;
      const copy = { ...prev };
      delete copy.documentId;
      return copy;
    });
    setIdCheckStatus(null);

    const normalized = val.trim().toUpperCase();
    if (!normalized) {
      setIdCheckStatus({ available: false, error: 'Document ID is required.' });
      setIdChecking(false);
      return;
    }

    setIdChecking(true);
    try {
      const availability = await checkDocumentIdAvailability(normalized, selectedNetwork);
      // Discard stale in-flight results if a newer lookup was initiated
      if (seq !== idValidationSeqRef.current) return;

      if (!availability.available) {
        const errMsg = availability.reason || 'Document ID already exists.';
        setIdCheckStatus({ available: false, error: errMsg });
        setErrors(prev => ({ ...prev, documentId: errMsg }));
      } else {
        setIdCheckStatus({ available: true, warning: availability.warning });
        setErrors(prev => {
          const copy = { ...prev };
          delete copy.documentId;
          return copy;
        });
      }
    } catch (err: any) {
      if (seq !== idValidationSeqRef.current) return;
      const errMsg = err?.message || 'Could not verify Document ID because the RPC request failed. Please retry.';
      setIdCheckStatus({
        available: false,
        error: errMsg,
      });
      setErrors(prev => ({
        ...prev,
        documentId: errMsg,
      }));
    } finally {
      if (seq === idValidationSeqRef.current) {
        setIdChecking(false);
      }
    }
  };

  const documentTypes: DocumentType[] = [
    'Property Deed',
    'Sale Agreement',
    'Rental Agreement',
    'Affidavit',
    'Power of Attorney',
  ];

  const handlePdfSelected = async (selected: File) => {
    setIsProcessingPdf(true);
    setErrors(prev => {
      const next = { ...prev };
      delete next.file;
      return next;
    });

    try {
      const validation = await validatePdfFile(selected, selected.name);
      if (!validation.valid) {
        setFile(null);
        setPdfMeta(null);
        setPrecalculatedHash(null);
        setErrors(prev => ({ ...prev, file: validation.error || 'Invalid PDF document.' }));
        return;
      }

      setFile(selected);
      setPdfMeta({
        pageCount: validation.pageCount,
        version: validation.pdfVersion,
      });

      // Compute exact SHA-256 digest on original bytes for live preview & duplicate checks
      const buffer = await selected.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedHash = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setPrecalculatedHash(computedHash);

      // Check duplicate hash against catalog
      const duplicate = documents.find(d => d.sha256Hash.toLowerCase() === computedHash.toLowerCase());
      if (duplicate) {
        setErrors(prev => ({
          ...prev,
          file: `Duplicate document detected! This exact PDF has already been registered as Document ID "${duplicate.id}" (${duplicate.name}).`
        }));
      }
    } catch (e: any) {
      setFile(null);
      setPdfMeta(null);
      setPrecalculatedHash(null);
      setErrors(prev => ({ ...prev, file: e?.message || 'Error processing PDF.' }));
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handlePdfSelected(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handlePdfSelected(e.dataTransfer.files[0]);
    }
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    const trimmedId = documentId.trim();
    if (!trimmedId) {
      errs.documentId = 'Document ID is required.';
    } else if (idCheckStatus?.available === false) {
      errs.documentId = idCheckStatus.error || 'Document ID already exists.';
    }
    if (!name.trim()) errs.name = 'Document title is required.';
    if (!owner.trim()) errs.owner = 'Issuing party / registrant name is required.';
    if (!issueDate) errs.issueDate = 'Issue date is required.';
    if (!file) errs.file = 'A valid digital PDF document is required for SHA-256 fingerprint generation.';
    
    // Contact information format and consent validation
    if (ownerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(ownerEmail.trim())) {
        errs.ownerEmail = 'Please provide a valid email address.';
      }
    }
    if (ownerEmail.trim() && !notificationConsent) {
      errs.notificationConsent = 'Owner consent is required to send registration notifications.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const executeRegistration = async () => {
    if (!isAuthor) {
      addToast('Author Access Required', 'Only authorized authors can register documents on-chain.', 'error');
      return;
    }
    if (walletStatus === 'connected' && !isCorrectNetwork) {
      addToast(
        'Network Mismatch',
        `Wallet is connected to the wrong network. Please switch to ${activeNetworkConfig.name} in your wallet before proceeding.`,
        'error'
      );
      return;
    }
    if (selectedNetwork === 'mainnet' && !isContractConfigured('mainnet')) {
      addToast(
        'Mainnet Contract Not Configured',
        'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED. Mainnet transactions cannot be submitted.',
        'error'
      );
      return;
    }
    if (!file) return;
    setIsSubmitting(true);
    setHashingProgress('Validating PDF & computing SHA-256 digest from exact bytes...');

    try {
      // Yield slightly to ensure hashing status is visible
      await new Promise(resolve => setTimeout(resolve, 300));

      const newDoc = await registerDocument({
        customId: documentId.trim().toUpperCase(),
        name: name.trim(),
        type,
        description: description.trim(),
        owner: owner.trim(),
        walletAddress: walletAddress || undefined,
        propertyId: propertyId.trim() || undefined,
        issueDate,
        expiryDate: expiryDate ? expiryDate : undefined,
        file,
        rawProvider: walletStatus === 'connected' ? provider : undefined,
        networkKey: selectedNetwork,
        ownerEmail: ownerEmail.trim() || undefined,
        notificationConsent: Boolean(notificationConsent),
      });

      setRegisteredResult(newDoc);
      setRetryRecipientEmail(ownerEmail.trim());

      // Dispatch notifications ONLY after confirmed transaction / registration record
      if (ownerEmail.trim() && notificationConsent) {
        try {
          const notif = await dispatchDocumentNotifications(newDoc.id, {
            txHash: newDoc.txHash,
            blockNumber: newDoc.blockNumber,
            ownerEmail: ownerEmail.trim(),
            documentTitle: newDoc.name,
            category: newDoc.type,
            issuer: newDoc.owner,
            registeredAt: newDoc.registeredAt,
            networkName: selectedNetwork === 'mainnet' ? 'MST Chain Mainnet' : 'MST Chain Testnet',
            sha256Hash: newDoc.sha256Hash,
            notificationConsent: true,
          });
          setNotificationResult(notif);
        } catch (notifErr: any) {
          setNotificationResult({
            success: false,
            category: 'network_error',
            error: notifErr?.message || 'Notification dispatch service unavailable.',
          });
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Could not complete client registration.';
      if (
        errMsg.includes('already registered') ||
        errMsg.includes('already exists') ||
        errMsg.includes('exists in the')
      ) {
        setIdCheckStatus({ available: false, error: errMsg });
        setErrors(prev => ({ ...prev, documentId: errMsg }));
        addToast('Document ID Conflict', errMsg, 'error');
      } else {
        addToast('Registration Failed', errMsg, 'error');
      }
    } finally {
      setIsSubmitting(false);
      setHashingProgress('');
      setMainnetConfirmOpen(false);
      setMainnetAcknowledged(false);
    }
  };

  const handleRetryEmail = async () => {
    if (!registeredResult) return;
    const targetRecipient = (retryRecipientEmail || ownerEmail).trim();
    if (!targetRecipient) {
      addToast('Recipient Email Required', 'Please enter an owner email address to receive the confirmation.', 'warning');
      return;
    }
    setIsRetryingEmail(true);
    setRecoveryError(null);
    try {
      const canonicalId = registeredResult.id.trim().toUpperCase();

      // Retrieve local PDF if present in IndexedDB or memory state
      let candidatePdfBlob: Blob | File | null = null;
      let candidateFileName = `${canonicalId}.pdf`;
      let candidatePageCount: number | undefined = undefined;

      const localPdf = await getLocalPDF(canonicalId);
      if (localPdf && localPdf.blob) {
        candidatePdfBlob = localPdf.blob;
        candidateFileName = localPdf.fileName || candidateFileName;
        candidatePageCount = localPdf.pageCount;
      } else if (file) {
        try {
          const fileBuf = await file.arrayBuffer();
          const fileHash = await computeSha256(fileBuf);
          if (areSha256HashesEqual(fileHash, registeredResult.sha256Hash)) {
            candidatePdfBlob = file;
            candidateFileName = file.name;
          }
        } catch {}
      }

      // 1. Sync and verify PDF with server storage
      const syncResult = await syncAndVerifyPdfForRetry(
        canonicalId,
        registeredResult.sha256Hash,
        candidatePdfBlob,
        {
          fileName: candidateFileName,
          fileSizeBytes: candidatePdfBlob?.size,
          pageCount: candidatePageCount,
          ownerWallet: registeredResult.registrantAddress,
          ownerEmail: targetRecipient,
          notificationConsent: true,
          txHash: registeredResult.txHash,
          blockNumber: registeredResult.blockNumber,
        }
      );

      if (!syncResult.success) {
        if (syncResult.reason === 'pdf_missing_everywhere') {
          setIsPdfRecoveryNeeded(true);
          const msg = 'The original PDF is unavailable in local and server storage. Please upload the original file again to continue.';
          setRecoveryError(msg);
          setNotificationResult((prev: any) => ({
            ...prev,
            success: false,
            category: 'file_missing',
            error: msg,
            notifications: {
              email: {
                status: 'failed',
                category: 'file_missing',
                error: msg,
              },
            },
          }));
          addToast('Original PDF Missing', msg, 'warning');
          return;
        }

        const errMsg = syncResult.error || 'PDF synchronization with server failed.';
        setRecoveryError(errMsg);
        const cat = syncResult.reason === 'local_hash_mismatch' || syncResult.reason === 'server_hash_mismatch'
          ? 'hash_mismatch'
          : syncResult.reason === 'upload_failed'
          ? 'upload_failed'
          : 'server_storage_missing';
        setNotificationResult((prev: any) => ({
          ...prev,
          success: false,
          category: cat,
          error: errMsg,
          notifications: {
            email: {
              status: 'failed',
              category: cat,
              error: errMsg,
            },
          },
        }));
        addToast('Verification Failed', errMsg, 'error');
        return;
      }

      // If we recovered it via file state, persist to local IndexedDB catalog
      if (candidatePdfBlob && (!localPdf || !localPdf.blob)) {
        await saveLocalPDF(canonicalId, candidatePdfBlob, {
          fileName: candidateFileName,
          sha256Hash: registeredResult.sha256Hash,
          fileSizeBytes: candidatePdfBlob.size,
          pageCount: candidatePageCount,
          ownerWallet: registeredResult.registrantAddress,
          ownerEmail: targetRecipient,
          notificationConsent: true,
          txHash: registeredResult.txHash,
          blockNumber: registeredResult.blockNumber,
        });
      }

      // 2. Dispatch notifications
      const notif = await dispatchDocumentNotifications(canonicalId, {
        txHash: registeredResult.txHash,
        blockNumber: registeredResult.blockNumber,
        ownerEmail: targetRecipient,
        documentTitle: registeredResult.name,
        category: registeredResult.type,
        issuer: registeredResult.owner,
        registeredAt: registeredResult.registeredAt,
        networkName: registeredResult.networkKey === 'mainnet' ? 'MST Chain Mainnet' : 'MST Chain Testnet',
        sha256Hash: registeredResult.sha256Hash,
        notificationConsent: true,
      });
      setNotificationResult(notif);
      const emailStatus = notif?.notifications?.email?.status;
      if (emailStatus === 'accepted' || emailStatus === 'delivered' || emailStatus === 'sent') {
        setIsPdfRecoveryNeeded(false);
        setRecoveryError(null);
        addToast('Email Dispatched', 'Registration confirmation email was accepted by provider.', 'success');
      } else {
        const errorMsg = notif?.notifications?.email?.error || notif?.error || 'Provider rejected email dispatch.';
        addToast('Email Dispatch Notice', errorMsg, 'warning');
      }
    } catch (err: any) {
      addToast('Retry Error', err?.message || 'Could not connect to notification server.', 'error');
    } finally {
      setIsRetryingEmail(false);
    }
  };

  const handleRecoverOriginalPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !registeredResult) return;

    setIsRecoveringFile(true);
    setRecoveryError(null);

    try {
      const canonicalId = registeredResult.id.trim().toUpperCase();
      console.log(`[PDF Recovery] Validating selected file for ${canonicalId}...`);

      // 1. Basic PDF validation
      const validation = await validatePdfFile(selectedFile);
      if (!validation.valid) {
        const err = validation.error || 'Invalid PDF file selected.';
        setRecoveryError(err);
        addToast('Invalid PDF', err, 'error');
        return;
      }

      // 2. Compute SHA-256 via WebCrypto
      const fileBuffer = await selectedFile.arrayBuffer();
      const computedHash = await computeSha256(fileBuffer);
      const targetHash = registeredResult.sha256Hash;

      // 3. Strict SHA-256 verification against on-chain hash
      if (!areSha256HashesEqual(computedHash, targetHash)) {
        const normComputed = normalizeSha256(computedHash);
        const normTarget = normalizeSha256(targetHash);
        const mismatchError = `SHA-256 Integrity Mismatch: The selected PDF (${normComputed.slice(0, 16)}...) does not match the registered on-chain document (${normTarget.slice(0, 16)}...). Please select the exact original PDF that was registered.`;
        setRecoveryError(mismatchError);
        setNotificationResult((prev: any) => ({
          ...prev,
          success: false,
          category: 'hash_mismatch',
          error: mismatchError,
          notifications: {
            email: {
              status: 'failed',
              category: 'hash_mismatch',
              error: mismatchError,
            },
          },
        }));
        addToast('Hash Mismatch', 'Selected file does not match the registered on-chain document.', 'error');
        return;
      }

      // 4. Save to IndexedDB
      await saveLocalPDF(canonicalId, selectedFile, {
        fileName: selectedFile.name,
        sha256Hash: targetHash,
        fileSizeBytes: selectedFile.size,
        pageCount: validation.pageCount,
        ownerWallet: registeredResult.registrantAddress,
        ownerEmail: (retryRecipientEmail || ownerEmail).trim(),
        notificationConsent: true,
        txHash: registeredResult.txHash,
        blockNumber: registeredResult.blockNumber,
      });

      // 5. Upload to backend server
      const uploadRes = await uploadPdfToServer(canonicalId, selectedFile, {
        fileName: selectedFile.name,
        sha256Hash: targetHash,
        fileSizeBytes: selectedFile.size,
        pageCount: validation.pageCount,
        ownerWallet: registeredResult.registrantAddress,
        ownerEmail: (retryRecipientEmail || ownerEmail).trim(),
        notificationConsent: true,
        txHash: registeredResult.txHash,
        blockNumber: registeredResult.blockNumber,
      });

      if (!uploadRes.success) {
        const uploadErr = uploadRes.error || 'Failed to upload recovered PDF to server storage.';
        setRecoveryError(uploadErr);
        setNotificationResult((prev: any) => ({
          ...prev,
          success: false,
          category: 'upload_failed',
          error: uploadErr,
          notifications: {
            email: {
              status: 'failed',
              category: 'upload_failed',
              error: uploadErr,
            },
          },
        }));
        addToast('Server Upload Failed', uploadErr, 'error');
        return;
      }

      // 6. Confirm server recognizes uploaded file under expected document ID
      const serverCheck = await checkServerDocument(canonicalId);
      if (!serverCheck.exists) {
        const confirmErr = 'Server upload finished but file was not recognized in storage catalog.';
        setRecoveryError(confirmErr);
        addToast('Server Storage Missing', confirmErr, 'error');
        return;
      }

      addToast('File Verified & Restored', 'Original PDF verified against on-chain hash and synced to storage. Dispatching email...', 'success');
      setIsPdfRecoveryNeeded(false);
      setRecoveryError(null);

      // 7. Dispatch confirmation email with real verified PDF
      const targetRecipient = (retryRecipientEmail || ownerEmail).trim();
      const notif = await dispatchDocumentNotifications(canonicalId, {
        txHash: registeredResult.txHash,
        blockNumber: registeredResult.blockNumber,
        ownerEmail: targetRecipient,
        documentTitle: registeredResult.name,
        category: registeredResult.type,
        issuer: registeredResult.owner,
        registeredAt: registeredResult.registeredAt,
        networkName: registeredResult.networkKey === 'mainnet' ? 'MST Chain Mainnet' : 'MST Chain Testnet',
        sha256Hash: targetHash,
        notificationConsent: true,
      });

      setNotificationResult(notif);
      const emailStatus = notif?.notifications?.email?.status;
      if (emailStatus === 'accepted' || emailStatus === 'delivered' || emailStatus === 'sent') {
        addToast('Email Dispatched', 'Registration confirmation email was accepted by provider.', 'success');
      } else {
        const errorMsg = notif?.notifications?.email?.error || notif?.error || 'Provider rejected email dispatch.';
        addToast('Email Dispatch Notice', errorMsg, 'warning');
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to recover PDF file.';
      setRecoveryError(msg);
      addToast('Recovery Error', msg, 'error');
    } finally {
      setIsRecoveringFile(false);
      if (recoveryFileInputRef.current) {
        recoveryFileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (isProcessingPdf) {
      addToast('Processing Document', 'Please wait for PDF validation and hash computation to complete.', 'info');
      return;
    }

    const isValid = validateForm();
    if (!isValid || !file) {
      const missingList: string[] = [];
      if (!documentId.trim()) missingList.push('Document ID');
      if (!name.trim()) missingList.push('Document Title');
      if (!owner.trim()) missingList.push('Issuing Party / Registrant');
      if (!issueDate) missingList.push('Date of Issue');
      if (!file) missingList.push('PDF Document File');

      const warningMsg = missingList.length > 0
        ? `Please provide all required details: ${missingList.join(', ')}.`
        : 'Please correct highlighted validation errors before proceeding.';

      addToast('Incomplete Document Details', warningMsg, 'warning');

      // Scroll smoothly to the first error element
      setTimeout(() => {
        const errorElement = document.querySelector('.border-red-400, .border-red-300, [aria-invalid="true"]');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }

    // Check duplicate hash before opening review
    if (precalculatedHash) {
      const duplicate = documents.find(d => d.sha256Hash.toLowerCase() === precalculatedHash.toLowerCase());
      if (duplicate) {
        const duplicateErr = `Duplicate document detected! This exact PDF is already registered under ID "${duplicate.id}". Duplicate registration is blocked.`;
        setErrors(prev => ({ ...prev, file: duplicateErr }));
        addToast('Duplicate Document Blocked', `Exact file hash already exists under ID ${duplicate.id}`, 'error');
        return;
      }
    }

    // Clear any previous form errors and open pre-signing review dialog
    setErrors({});
    setPreSignModalOpen(true);
  };

  const handleConfirmPreSign = async () => {
    setPreSignModalOpen(false);
    if (walletStatus === 'connected' && !isCorrectNetwork) {
      addToast(
        'Network Mismatch',
        `Your connected wallet is on a different chain. Please switch to ${activeNetworkConfig.name} before submitting.`,
        'error'
      );
      return;
    }
    if (selectedNetwork === 'mainnet') {
      if (!isContractConfigured('mainnet')) {
        addToast(
          'Mainnet Contract Not Configured',
          'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED. Mainnet registrations are blocked until the contract is deployed.',
          'error'
        );
        return;
      }
      if (walletStatus === 'connected') {
        const capabilities = await verifyContractCapabilities('mainnet');
        if (!capabilities.valid) {
          addToast(
            'Mainnet Contract Unconfigured',
            capabilities.error || 'MST Chain Mainnet contract is not configured or does not implement NotaryVaultRegistry.',
            'warning'
          );
          return;
        }
        setMainnetConfirmOpen(true);
        return;
      }
    }
    await executeRegistration();
  };

  const copyToClipboard = (text: string, type: 'hash' | 'id') => {
    navigator.clipboard.writeText(text);
    if (type === 'hash') {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
      addToast('SHA-256 Copied', 'Hash fingerprint copied to clipboard.');
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      addToast('Document ID Copied', 'ID copied to clipboard.');
    }
  };

  const resetForm = () => {
    setName('');
    setType('Property Deed');
    setDescription('');
    setOwner('');
    setPropertyId('');
    setIssueDate('');
    setExpiryDate('');
    setOwnerEmail('');
    setNotificationConsent(false);
    setNotificationResult(null);
    setIsPdfRecoveryNeeded(false);
    setIsRecoveringFile(false);
    setRecoveryError(null);
    setFile(null);
    setPdfMeta(null);
    setPrecalculatedHash(null);
    setErrors({});
    setRegisteredResult(null);
    handleGenerateNewId();
  };

  const isMainnet = selectedNetwork === 'mainnet';

  return (
    <AppShell
      title="Register Document"
      subtitle={`Secure cryptographic registration and SHA-256 baseline generation for ${activeNetworkConfig.name}.`}
    >
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Network Info & Chain Verification Banner */}
        <div className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isMainnet 
            ? 'bg-purple-50/80 border-purple-200 text-purple-950' 
            : 'bg-blue-50/80 border-blue-200 text-blue-950'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isMainnet ? 'bg-purple-200 text-purple-800' : 'bg-blue-200 text-blue-800'
            }`}>
              {isMainnet ? <Flame className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            </div>
            <div>
              <div className="font-bold flex items-center gap-1.5">
                <span>Active Target: {activeNetworkConfig.name}</span>
                <span className="font-mono text-[10px] bg-white/70 px-1.5 py-0.5 rounded border border-black/5">
                  ID: {activeNetworkConfig.chainIdDecimal}
                </span>
              </div>
              <p className="text-[11px] opacity-80 mt-0.5">
                {isMainnet 
                  ? 'Mainnet transactions consume real MSTC gas and create permanent public records.' 
                  : 'Testnet transactions use simulated testnet MSTC for free development validation.'}
              </p>
            </div>
          </div>

          {/* Wallet mismatch warning and switch action */}
          {walletStatus === 'connected' && !isCorrectNetwork && (
            <button
              type="button"
              onClick={() => switchNetworkToMST(selectedNetwork)}
              className="py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Switch Wallet to {isMainnet ? 'Mainnet' : 'Testnet'}</span>
            </button>
          )}
        </div>

        {/* Unauthorized Author Warning Banner */}
        {walletStatus === 'connected' && !isAuthor && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-3 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-amber-950">
                Unauthorized Author Notice (Public User Account)
              </div>
              <p>
                Your connected wallet (<code className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-950 font-semibold">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</code>) is a Public User account without authoring permissions.
              </p>
              <p className="text-[11px] text-amber-800">
                Only the designated <strong>Super Author</strong> or approved <strong>Secondary Authors</strong> can register official documents.
              </p>
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/app/apply-author')}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs cursor-pointer transition-colors"
                >
                  Apply to Become an Author
                </button>
                <span className="text-[10px] text-amber-700 italic">
                  * Note: Client-side safeguard. The live Testnet contract was deployed with v1 permissionless bytecode.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Success Result View */}
        {registeredResult ? (
          <Card className="p-8 space-y-6 bg-white border border-emerald-200 animate-in fade-in duration-300">
            <div className="flex items-center gap-4 border-b border-black/5 pb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1C1C1C]">
                  Document Registered Successfully
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Assigned ID and cryptographic fingerprint generated. Ready for immediate verification.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Document Summary */}
              <div className="md:col-span-2 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-400 block mb-0.5 font-medium">Document ID</span>
                    <div className="flex items-center justify-between font-mono font-bold text-stone-900 text-sm">
                      <span>{registeredResult.id}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(registeredResult.id, 'id')}
                        className="text-stone-400 hover:text-stone-700 p-1"
                        title="Copy Document ID"
                      >
                        {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-400 block mb-0.5 font-medium">Document Title</span>
                    <div className="font-semibold text-stone-900 truncate">{registeredResult.name}</div>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-400 block mb-0.5 font-medium">Classification</span>
                    <div className="font-semibold text-stone-900">{registeredResult.type}</div>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-400 block mb-0.5 font-medium">Property ID</span>
                    <div className="font-mono font-bold text-stone-900">{registeredResult.propertyId || 'Unassigned'}</div>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl col-span-2">
                    <span className="text-stone-400 block mb-0.5 font-medium">Registration Status</span>
                    <div className="mt-1 flex items-center justify-between">
                      <StatusPill status={registeredResult.status} size="sm" />
                      {registeredResult.hasConflictWarning && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                          Flagged for Review
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* On-Chain Anchoring Badge & Dynamic Explorer Links */}
                {registeredResult.onChainStatus === 'registered' && registeredResult.txHash ? (
                  <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>
                          Anchored on {registeredResult.networkKey === 'mainnet' ? 'MST Chain Mainnet' : 'MST Chain Testnet'}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                        Block #{registeredResult.blockNumber || 'Mined'}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-stone-700 break-all bg-white p-2.5 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <span className="truncate pr-2">{registeredResult.txHash}</span>
                      <a
                        href={getExplorerTxUrl(registeredResult.txHash, registeredResult.networkKey || selectedNetwork)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:underline shrink-0 text-[10px] font-bold inline-flex items-center gap-1"
                      >
                        <span>MSTScan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {registeredResult.contractAddress && (
                      <div className="flex items-center justify-between text-[11px] pt-1 text-emerald-900">
                        <span className="text-stone-500">Contract:</span>
                        <a
                          href={getExplorerAddressUrl(registeredResult.contractAddress, registeredResult.networkKey || selectedNetwork)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-emerald-700 hover:underline inline-flex items-center gap-1"
                        >
                          <span className="truncate max-w-[200px]">{registeredResult.contractAddress}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-stone-50 rounded-xl border border-black/5 text-[11px] text-stone-600 flex items-center justify-between">
                    <span>Baseline recorded in local catalog.</span>
                    <span className="text-[10px] text-stone-500 font-medium">
                      {isContractConfigured(selectedNetwork) 
                        ? (walletStatus === 'connected' ? `Ready for anchoring on ${activeNetworkConfig.name}` : `Connect wallet to anchor on ${activeNetworkConfig.name}`) 
                        : `Contract not deployed to ${activeNetworkConfig.name}`}
                    </span>
                  </div>
                )}

              </div>

              {/* Public Verification Reference Card */}
              <div className="flex flex-col items-center justify-center p-5 bg-[#FCFBF8] border border-black/5 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1F6FF0] flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                    Public Verification ID
                  </span>
                  <span className="font-mono text-sm font-bold text-stone-800 bg-white px-3 py-1 rounded-lg border border-black/10 inline-block shadow-2xs">
                    {registeredResult.id}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 leading-tight max-w-[200px]">
                  Anyone can verify this document on the public portal using this Document ID.
                </p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(buildPublicVerificationUrl(registeredResult.id), 'id')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-50 border border-black/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-stone-500" />
                  <span>Copy Verification URL</span>
                </button>
              </div>

            </div>

            {/* SHA-256 Digest Box */}
            <div className="p-4 bg-stone-50 rounded-2xl border border-black/5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                <span>Calculated SHA-256 Digest (Client WebCrypto)</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(registeredResult.sha256Hash, 'hash')}
                  className="text-[#1F6FF0] hover:underline flex items-center gap-1 font-mono text-[11px] cursor-pointer"
                >
                  {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedHash ? 'Copied' : 'Copy Hash'}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-stone-800 break-all bg-white p-3 rounded-xl border border-black/5 select-all">
                {registeredResult.sha256Hash}
              </div>
            </div>

            {/* Owner Notifications Delivery Status Banner */}
            {ownerEmail && (
              <div className="p-4 bg-stone-50 border border-black/10 rounded-2xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-stone-900">
                    <Bell className="w-4 h-4 text-[#1F6FF0]" />
                    <span>Owner Registration Notification</span>
                  </div>
                  <span className="text-[10px] font-mono text-stone-500">Post-Confirmation Dispatch</span>
                </div>

                <div className="pt-1">
                  <div className="p-3 bg-white rounded-xl border border-black/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-stone-400" />
                        <span>Email Status</span>
                      </span>
                      {['accepted', 'delivered', 'sent'].includes(notificationResult?.notifications?.email?.status) ? (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          {notificationResult?.notifications?.email?.status === 'delivered' ? 'Delivered' : 'Accepted by Provider'}
                        </span>
                      ) : (notificationResult?.notifications?.email?.status === 'unconfigured' || notificationResult?.category === 'unconfigured') ? (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                          Email Provider Not Configured
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full border border-red-200">
                          {(() => {
                            const cat = notificationResult?.notifications?.email?.category || notificationResult?.category;
                            if (cat === 'recipient_not_permitted') return 'Recipient Restricted (Resend Sandbox)';
                            if (cat === 'sender_unverified') return 'Sender Domain Unverified';
                            if (cat === 'file_missing') return 'Original PDF Missing from Storage';
                            if (cat === 'local_file_missing') return 'Local PDF Missing';
                            if (cat === 'upload_failed') return 'Server Upload Failed';
                            if (cat === 'server_storage_missing') return 'Server Storage Missing';
                            if (cat === 'hash_mismatch') return 'PDF Hash Mismatch';
                            if (cat === 'network_error') return 'Connection Failed';
                            return 'Email Dispatch Failed';
                          })()}
                        </span>
                      )}
                    </div>

                    {/* Recipient Display & Verification ID */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-stone-600">
                        <span>Configured Recipient:</span>
                        <strong className="font-mono text-stone-900">{retryRecipientEmail || ownerEmail}</strong>
                      </div>

                      {notificationResult?.notifications?.email?.deliveryId && (
                        <p className="text-[10px] font-mono text-stone-500 truncate">
                          Provider Message ID: <code>{notificationResult.notifications.email.deliveryId}</code>
                        </p>
                      )}
                    </div>

                    {/* Accepted State */}
                    {['accepted', 'delivered', 'sent'].includes(notificationResult?.notifications?.email?.status) && (
                      <p className="text-[10px] text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 leading-relaxed">
                        ✓ Confirmation email with verified PDF attachment was successfully accepted by the email provider for delivery. Blockchain registration metadata and transaction hash are permanently anchored.
                      </p>
                    )}

                    {/* Unconfigured State */}
                    {(notificationResult?.notifications?.email?.status === 'unconfigured' || notificationResult?.category === 'unconfigured') && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200 leading-relaxed">
                          <strong>Email provider is not configured:</strong> Setup <code>EMAIL_PROVIDER=resend</code> and <code>RESEND_API_KEY</code> in <code>.env</code>. Once configured, click Retry below to dispatch the email without registering on-chain again.
                        </p>
                        <button
                          type="button"
                          onClick={handleRetryEmail}
                          disabled={isRetryingEmail}
                          className="text-xs font-semibold text-[#1F6FF0] hover:text-[#1855b8] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRetryingEmail ? 'animate-spin' : ''}`} />
                          <span>{isRetryingEmail ? 'Retrying Email Dispatch...' : 'Retry Email Confirmation'}</span>
                        </button>
                      </div>
                    )}

                    {/* Failure State & Retry / Recovery Action */}
                    {!['accepted', 'delivered', 'sent', 'unconfigured'].includes(notificationResult?.notifications?.email?.status) && notificationResult?.category !== 'unconfigured' && (
                      <div className="space-y-2.5 pt-0.5">
                        <div className="text-[10px] text-red-900 bg-red-50 p-2.5 rounded-lg border border-red-200 space-y-1">
                          <div className="font-bold flex items-center gap-1 text-red-950">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>
                              {(() => {
                                const cat = notificationResult?.notifications?.email?.category || notificationResult?.category;
                                if (cat === 'recipient_not_permitted') return "Recipient Restricted by Resend Sandbox";
                                if (cat === 'sender_unverified') return "Sender Domain Unverified";
                                if (cat === 'file_missing') return "Original PDF Missing from Storage";
                                if (cat === 'local_file_missing') return "Local Original PDF Missing";
                                if (cat === 'upload_failed') return "Server Storage Upload Failure";
                                if (cat === 'server_storage_missing') return "Server Storage Missing";
                                if (cat === 'hash_mismatch') return "PDF Hash Integrity Verification Failed";
                                if (cat === 'network_error') return "Network / Storage Server Connection Failed";
                                return "Email Dispatch Failed";
                              })()}
                            </span>
                          </div>
                          <p className="leading-relaxed">
                            {notificationResult?.notifications?.email?.error || notificationResult?.error || 'Provider rejected email dispatch.'}
                          </p>
                        </div>

                        {/* Re-upload Recovery Action if PDF is missing in local and server storage */}
                        {(isPdfRecoveryNeeded || notificationResult?.category === 'file_missing' || notificationResult?.notifications?.email?.category === 'file_missing' || notificationResult?.error?.includes('unavailable in local and server storage') || notificationResult?.error?.includes('Original PDF is missing')) && (
                          <div className="p-3 bg-amber-50/90 border border-amber-300 rounded-xl space-y-2">
                            <div className="flex items-start gap-2 text-amber-950 font-semibold text-[11px]">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <span>Original PDF Re-upload Required</span>
                            </div>
                            <p className="text-[11px] text-amber-900 leading-relaxed">
                              The original PDF is unavailable in local and server storage. Note: The SHA-256 cryptographic digest and JSON metadata receipt confirm document existence and on-chain timestamping, but because cryptographic hashing is a one-way mathematical function, they cannot reconstruct or recreate the original PDF file bytes. To restore storage and delivery, the exact original PDF file must be provided.
                            </p>
                            {recoveryError && (
                              <p className="text-[10px] text-red-700 bg-red-100/70 p-2 rounded border border-red-200 font-mono">
                                {recoveryError}
                              </p>
                            )}
                            <div className="pt-1 flex flex-wrap items-center gap-3">
                              <input
                                type="file"
                                ref={recoveryFileInputRef}
                                onChange={handleRecoverOriginalPdf}
                                accept="application/pdf"
                                className="hidden"
                              />
                              <button
                                type="button"
                                onClick={() => recoveryFileInputRef.current?.click()}
                                disabled={isRecoveringFile}
                                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                              >
                                <UploadCloud className={`w-3.5 h-3.5 ${isRecoveringFile ? 'animate-spin' : ''}`} />
                                <span>{isRecoveringFile ? 'Verifying & Restoring...' : 'Select Original PDF to Recover'}</span>
                              </button>
                              <span className="text-[10px] text-stone-500">
                                Requires exact match with registered on-chain SHA-256 hash.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Editable Recipient Email & Retry Action */}
                        <div className="p-2.5 bg-stone-50 rounded-lg border border-black/5 space-y-1.5">
                          <label className="text-[10px] font-semibold text-stone-700 block">
                            Target Recipient Email for Retry:
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="email"
                              value={retryRecipientEmail}
                              onChange={(e) => setRetryRecipientEmail(e.target.value)}
                              placeholder="e.g. verified-account@example.com"
                              className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-lg font-mono focus:outline-hidden focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={handleRetryEmail}
                              disabled={isRetryingEmail || isRecoveringFile}
                              className="px-3 py-1.5 bg-[#1F6FF0] hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs shrink-0"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isRetryingEmail ? 'animate-spin' : ''}`} />
                              <span>{isRetryingEmail ? 'Retrying...' : 'Retry Email Confirmation'}</span>
                            </button>
                          </div>
                          <p className="text-[9px] text-stone-500">
                            * Retrying dispatches the confirmed document ({registeredResult.id}) with the verified PDF attachment and transaction hash ({registeredResult.txHash?.slice(0, 10)}...). It will <strong>NOT</strong> register on-chain or broadcast another transaction.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Local Storage Disclaimer */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-950">Local Browser Storage Notice</p>
                <p className="text-[11px] leading-relaxed">{LOCAL_STORAGE_DISCLAIMER}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => downloadLocalPDF(registeredResult.id, registeredResult.name)}
                  icon={<Download className="w-4 h-4" />}
                >
                  Download Original PDF
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => downloadDocumentReceipt(registeredResult, {
                    storageStatus: 'verified',
                    blockchainStatus: registeredResult.onChainStatus === 'registered' ? 'confirmed' : 'pending',
                    emailStatus: notificationResult?.notifications?.email?.status || 'not_requested',
                  })}
                  icon={<Download className="w-4 h-4" />}
                >
                  Download Receipt (JSON)
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={resetForm}
                >
                  Register Another Document
                </Button>
                <Button
                  variant="primary-app"
                  size="md"
                  onClick={() => navigate(`/app/documents/${registeredResult.id}`)}
                >
                  View Document Details
                </Button>
              </div>
            </div>
          </Card>
        ) : !isAuthor ? (
          <Card className="p-8 text-center flex flex-col items-center justify-center space-y-4 bg-white border border-black/10">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="text-lg font-bold text-[#1C1C1C]">Author Access Required</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Document registration on MST Chain is restricted to authorized Secondary Authors and the Super Author. Public Users do not possess on-chain registration privileges.
              </p>
              <div className="text-xs text-stone-600 bg-stone-50 p-3 rounded-xl border border-black/5 font-mono break-all">
                Connected Wallet: {walletAddress || 'Disconnected'}
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="primary-app"
                size="md"
                onClick={() => navigate('/app/apply-author')}
              >
                Apply to Become an Author
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => navigate('/app/verify')}
              >
                Verify Existing Document
              </Button>
            </div>
          </Card>
        ) : (
          /* Registration Input Form */
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Primary Details Card */}
            <Card className="p-6 md:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1C]">
                  Document Information
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Provide primary classification, ownership, and identification details.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Document ID with Live Uniqueness Preflight & Collision Handling */}
                <div className="md:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider">
                      Document ID *
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateNewId}
                      disabled={isGeneratingId}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                      title="Generate another candidate ID"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingId ? 'animate-spin' : ''}`} />
                      <span>Generate New ID</span>
                    </button>
                  </div>

                  <div className="relative">
                    <Input
                      placeholder="e.g. NV-2026-000101"
                      value={documentId}
                      onChange={(e) => handleDocumentIdChange(e.target.value)}
                      error={errors.documentId}
                      className="font-mono font-bold tracking-wide uppercase"
                    />
                  </div>

                  {/* Real-time Uniqueness Feedback */}
                  {idChecking ? (
                    <p className="text-[11px] text-stone-500 font-medium flex items-center gap-1.5 pt-0.5">
                      <RefreshCw className="w-3 h-3 animate-spin text-stone-400" />
                      <span>Checking global uniqueness across active & historical contracts...</span>
                    </p>
                  ) : idCheckStatus?.available === false ? (
                    <div className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                      idCheckStatus.error?.toLowerCase().includes('rpc')
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                        idCheckStatus.error?.toLowerCase().includes('rpc')
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`} />
                      <div className="space-y-0.5">
                        <span className="font-bold block">
                          {idCheckStatus.error?.toLowerCase().includes('rpc')
                            ? 'On-Chain RPC Verification Failure'
                            : idCheckStatus.error?.includes('historical')
                            ? 'Historical Registry Collision'
                            : idCheckStatus.error?.includes('active')
                            ? 'Active Registry Collision'
                            : idCheckStatus.error?.includes('local')
                            ? 'Local Catalog Collision'
                            : 'Document ID Collision'}
                        </span>
                        <p>{idCheckStatus.error || 'Document ID already exists.'}</p>
                      </div>
                    </div>
                  ) : documentId.trim() && idCheckStatus?.available ? (
                    idCheckStatus.warning ? (
                      <div className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                        idCheckStatus.warning.toLowerCase().includes('unavailable')
                          ? 'bg-blue-50/80 border-blue-200/80 text-blue-900'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}>
                        {idCheckStatus.warning.toLowerCase().includes('unavailable') ? (
                          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-0.5">
                          <span className="font-bold block">
                            {idCheckStatus.warning.toLowerCase().includes('unavailable')
                              ? 'On-Chain Registry Status'
                              : 'On-Chain Verification Notice'}
                          </span>
                          <p>{idCheckStatus.warning}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1.5 pt-0.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Document ID is unique and verified across active and historical registries.</span>
                      </p>
                    )
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <Input
                    label="Document Title *"
                    placeholder="e.g. Master Title Deed - Parcel 442A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={errors.name}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                    Document Category *
                  </label>
                  <div className="space-y-2">
                    {documentTypes.map((t) => (
                      <OptionRow
                        key={t}
                        label={t}
                        selected={type === t}
                        onClick={() => setType(t)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <Input
                    label="Issuing Party / Registrant *"
                    placeholder="e.g. City Notary Office or Land Registry Dept"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    error={errors.owner}
                  />

                  <div className="space-y-1.5">
                    <Input
                      label="Property ID (Optional)"
                      placeholder="e.g. PROP-2026-0891"
                      value={propertyId}
                      onChange={(e) => setPropertyId(e.target.value)}
                      helperText="Associate multiple deeds, agreements, or certificates under one property parcel."
                    />
                    {propertyId && (() => {
                      const conflict = checkPropertyConflicts(propertyId, owner);
                      if (conflict.hasConflict) {
                        return (
                          <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 space-y-0.5">
                            <span className="font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Conflicting Claim Detected</span>
                            </span>
                            <p>{conflict.note}</p>
                            <p className="text-[10px] text-amber-700">Document will be associated with this property but flagged for registrar review.</p>
                          </div>
                        );
                      }
                      if (conflict.existingDocs.length > 0) {
                        return (
                          <div className="p-2 bg-blue-50 rounded-xl border border-blue-200 text-[11px] text-blue-900">
                            Associating with existing Property <strong>{propertyId.toUpperCase()}</strong> ({conflict.existingDocs.length} prior document(s)).
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <Input
                    type="date"
                    label="Date of Issue *"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    error={errors.issueDate}
                  />

                  <Input
                    type="date"
                    label="Expiry / Validity Date (Optional)"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <Textarea
                    label="Document Notes & Summary"
                    placeholder="Provide relevant contextual notes, conveyance clauses, or reference numbers..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </Card>

            {/* Combined PDF Upload Card (Feature 1) */}
            <Card className="p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#1C1C1C] flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#1F6FF0]" />
                    <span>Combined PDF Document & Hashing</span>
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Upload a single PDF containing multi-page scans or deeds. Processed client-side via exact-byte SHA-256.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 bg-stone-50 px-2.5 py-1 rounded-xl border border-black/5 font-medium">
                  <Info className="w-3.5 h-3.5 text-stone-400" />
                  <span>Exact Byte Hashing</span>
                </div>
              </div>

              {/* Requirement: Notice near the upload control */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/70 rounded-2xl flex items-center justify-between text-xs text-blue-950">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold">{PDF_SIZE_NOTICE}</span>
                </div>
                <span className="text-[11px] font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                  PDF format only
                </span>
              </div>

              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="application/pdf,.pdf"
              />

              {file ? (
                /* File Selected Preview */
                <div className="p-4 bg-stone-50 border border-black/10 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#1F6FF0] flex items-center justify-center shrink-0">
                        <FileCheck2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#1C1C1C] truncate">
                          {file.name}
                        </div>
                        <div className="text-xs text-stone-500 font-mono mt-0.5 flex items-center gap-2">
                          <span className="font-semibold text-stone-700">{formatFileSize(file.size)}</span>
                          {pdfMeta?.pageCount && (
                            <span>• {pdfMeta.pageCount} page(s)</span>
                          )}
                          {pdfMeta?.version && (
                            <span>• PDF v{pdfMeta.version}</span>
                          )}
                          <span>• Multi-page supported</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setPdfMeta(null);
                        setPrecalculatedHash(null);
                      }}
                      className="p-2 text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
                      aria-label="Remove selected PDF"
                      title="Remove PDF and choose another"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Calculated SHA-256 Digest preview */}
                  {precalculatedHash && (
                    <div className="p-3 bg-white rounded-xl border border-black/5 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        <span>Calculated SHA-256 Digest (Exact original bytes):</span>
                        <span className="text-emerald-700 font-mono">Verified byte-exact</span>
                      </div>
                      <div className="font-mono text-[11px] text-stone-800 break-all select-all">
                        {precalculatedHash}
                      </div>
                    </div>
                  )}

                  {isProcessingPdf && (
                    <p className="text-[11px] text-blue-600 font-medium flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Processing PDF & computing digest...</span>
                    </p>
                  )}
                </div>
              ) : (
                /* Drag & Drop / Click Zone */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-[#1F6FF0] bg-blue-50/40'
                      : errors.file 
                        ? 'border-red-300 bg-red-50/20' 
                        : 'border-black/15 hover:border-[#1F6FF0] hover:bg-blue-50/20'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-500 flex items-center justify-center mx-auto mb-3">
                    <UploadCloud className="w-6 h-6 stroke-[1.75]" />
                  </div>
                  <div className="text-sm font-bold text-[#1C1C1C]">
                    Click to browse or drag and drop single PDF document
                  </div>
                  <div className="text-xs text-stone-500 mt-1">
                    Accepts valid multi-page or scanned PDFs up to 50 MB (52,428,800 bytes)
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    (Examples: 100 KB, 1 MB, 10 MB, 50 MB)
                  </div>
                  {errors.file && (
                    <p className="text-xs font-semibold text-red-600 mt-3">{errors.file}</p>
                  )}
                </div>
              )}

              {/* Client Security Notice */}
              <div className="p-3 bg-stone-50 rounded-xl border border-black/5 text-[11px] text-stone-600 flex items-start gap-2">
                <Info className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Client Security Notice:</strong> The raw PDF bytes are never sent to the blockchain or any remote server. Only the SHA-256 cryptographic digest is anchored on-chain.
                </span>
              </div>
            </Card>

            {/* Owner Notifications & Contact Details Card */}
            <Card className="p-6 md:p-8 space-y-5">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1C] flex items-center gap-2">
                  <Bell className="w-5 h-5 text-[#1F6FF0]" />
                  <span>Owner Contact & Email Notification (Optional)</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Receive verified confirmation via Email once the blockchain transaction is confirmed. Contact information is confidential and never published on-chain.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Input
                    label="Owner Email Address (Optional)"
                    placeholder="e.g. owner@example.com"
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    error={errors.ownerEmail}
                    helperText="Used strictly to deliver Document ID, transaction receipt, and private access link upon confirmed registration."
                  />
                </div>

                <div className="md:col-span-2 pt-1">
                  <label className="flex items-start gap-2.5 p-3.5 bg-stone-50 rounded-xl border border-black/5 cursor-pointer select-none">
                    <input
                      id="notification-consent-checkbox"
                      type="checkbox"
                      checked={notificationConsent}
                      onChange={(e) => setNotificationConsent(e.target.checked)}
                      className="mt-0.5 rounded text-[#1F6FF0] focus:ring-[#1F6FF0] cursor-pointer"
                    />
                    <div className="space-y-0.5 text-xs">
                      <span className="font-semibold text-stone-900 block">
                        I authorize NotaryVault to send registration confirmation notifications to this email address.
                      </span>
                      <p className="text-[11px] text-stone-500 leading-relaxed">
                        Notifications contain your Document ID, title, and transaction hash. Contact information is kept strictly private off-chain and is never stored on the blockchain or displayed on the public verification page.
                      </p>
                    </div>
                  </label>
                  {errors.notificationConsent && (
                    <p className="text-xs text-red-600 mt-1.5 font-medium">{errors.notificationConsent}</p>
                  )}
                </div>
              </div>
            </Card>

            {/* Error Summary Banner when validation fails */}
            {Object.keys(errors).length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-900 flex items-start gap-3 shadow-xs animate-in fade-in duration-200">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <span className="font-bold block text-red-950">
                    Cannot Proceed: Please Complete All Required Document Information
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-800">
                    {errors.documentId && <li><strong>Document ID:</strong> {errors.documentId}</li>}
                    {errors.name && <li><strong>Document Title:</strong> {errors.name}</li>}
                    {errors.owner && <li><strong>Issuing Party:</strong> {errors.owner}</li>}
                    {errors.issueDate && <li><strong>Date of Issue:</strong> {errors.issueDate}</li>}
                    {errors.file && <li><strong>Source PDF Document:</strong> {errors.file}</li>}
                  </ul>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
              <div className="text-xs text-blue-600 font-medium">
                {isSubmitting && hashingProgress && (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{hashingProgress}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => navigate('/app/documents')}
                >
                  Cancel
                </Button>
                <Button
                  id="review-register-btn"
                  type="submit"
                  variant="primary-app"
                  size="md"
                  loading={isSubmitting || isProcessingPdf}
                  disabled={walletStatus === 'connected' && !isAuthor}
                  icon={<ShieldCheck className="w-4 h-4" />}
                  className={isMainnet ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                >
                  {walletStatus === 'connected' && !isAuthor 
                    ? 'Author Privileges Required' 
                    : isProcessingPdf 
                    ? 'Computing Hash...' 
                    : (isMainnet ? 'Review & Anchor to Mainnet' : 'Review & Register Document')}
                </Button>
              </div>
            </div>

          </form>
        )}

      </div>

      {/* Pre-signing Review & Blockchain Anchoring Modal */}
      <Modal
        isOpen={preSignModalOpen}
        onClose={() => setPreSignModalOpen(false)}
        title="Review Document Registration"
        subtitle="Verify all metadata and cryptographic parameters before initiating registration."
      >
        <div className="space-y-4 text-xs">
          
          {/* Key Metadata Table */}
          <div className="p-3.5 bg-stone-50 rounded-2xl border border-black/5 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-black/5">
              <span className="text-stone-500 font-medium">Document ID:</span>
              <span className="font-mono font-bold text-stone-900">{documentId.trim().toUpperCase()}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-black/5">
              <span className="text-stone-500 font-medium">Document Title:</span>
              <span className="font-semibold text-stone-900 truncate max-w-[200px]">{name}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-black/5">
              <span className="text-stone-500 font-medium">Classification:</span>
              <span className="font-medium text-stone-800">{type}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-black/5">
              <span className="text-stone-500 font-medium">Registrant:</span>
              <span className="font-medium text-stone-800 truncate max-w-[200px]">{owner}</span>
            </div>
            {propertyId && (
              <div className="flex items-center justify-between pb-2 border-b border-black/5">
                <span className="text-stone-500 font-medium">Property ID:</span>
                <span className="font-mono font-semibold text-stone-800">{propertyId.toUpperCase()}</span>
              </div>
            )}
            <div className="flex items-center justify-between pb-2 border-b border-black/5">
              <span className="text-stone-500 font-medium">PDF File Size:</span>
              <span className="font-mono text-stone-800">{file ? formatFileSize(file.size) : 'N/A'} {pdfMeta?.pageCount ? `(${pdfMeta.pageCount} page(s))` : ''}</span>
            </div>
            <div className="space-y-1 pt-1">
              <span className="text-stone-500 font-medium block">Exact SHA-256 Digest:</span>
              <div className="font-mono text-[10px] text-stone-800 bg-white p-2 rounded-lg border border-black/5 break-all select-all">
                {precalculatedHash || 'Computing...'}
              </div>
            </div>
          </div>

          {/* Wallet and Blockchain Notice */}
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-2xl text-blue-950 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Next Step: Wallet-Signed Blockchain Transaction</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              Proceeding will prompt your connected Web3 wallet ({walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'wallet'}) to sign and broadcast the on-chain registration to <strong>{activeNetworkConfig.name}</strong>.
            </p>
            <p className="text-[11px] font-semibold text-blue-900">
              Only the Document ID, SHA-256 hash, and metadata are stored on the blockchain. The PDF bytes are NEVER uploaded to the blockchain.
            </p>
          </div>

          {/* Local Storage Notice */}
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl text-amber-950 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Local Storage Notice</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-900">
              {LOCAL_STORAGE_DISCLAIMER}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-black/5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPreSignModalOpen(false)}
            >
              Back & Edit
            </Button>
            <Button
              type="button"
              variant="primary-app"
              size="sm"
              onClick={handleConfirmPreSign}
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
            >
              Confirm & Sign Transaction
            </Button>
          </div>

        </div>
      </Modal>

      {/* Mainnet Confirmation Modal */}
      <Modal
        isOpen={mainnetConfirmOpen}
        onClose={() => setMainnetConfirmOpen(false)}
        title="Confirm MST Mainnet Anchoring"
        subtitle="This operation broadcasts a permanent transaction to the public MST Chain Mainnet."
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Real Blockchain Assets Required</span>
            </div>
            <p className="leading-relaxed">
              You are preparing to anchor this document to <strong>MST Chain Mainnet (Chain ID 4646)</strong>.
              This transaction consumes <strong>real MSTC assets</strong> from your connected BridgeKey wallet and permanently inscribes the document ID and SHA-256 fingerprint on-chain.
            </p>
            <p className="font-semibold text-amber-950">
              Anchored records are immutable and irreversible.
            </p>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-black/5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mainnetAcknowledged}
              onChange={(e) => setMainnetAcknowledged(e.target.checked)}
              className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
            <span className="text-stone-700 leading-snug">
              I understand this transaction uses real assets on MST Mainnet and cannot be undone.
            </span>
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setMainnetConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary-app"
              size="sm"
              disabled={!mainnetAcknowledged}
              onClick={executeRegistration}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-40"
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
            >
              Confirm & Broadcast to Mainnet
            </Button>
          </div>
        </div>
      </Modal>

    </AppShell>
  );
};
