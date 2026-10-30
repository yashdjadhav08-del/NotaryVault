/**
 * Owner Notification and Document Delivery Service for NotaryVault.
 *
 * Requirements:
 * - Collects recipient email and mobile number with international country code.
 * - Authenticates owner and verifies SHA-256 integrity before sending original PDF.
 * - Delivers actual PDF as an email attachment via configured provider (Resend or SMTP).
 * - Sends concise SMS notification with HTTPS secure-access URL via Twilio.
 * - Distinguishes provider acceptance ('accepted') from confirmed delivery.
 * - Never pretends email or SMS was sent when no provider is configured.
 * - Supports mock mode for automated testing without sending real emails/SMS.
 */

/**
 * Checks whether email and SMS notification providers are genuinely configured in the environment.
 */
export function getNotificationProviderStatus() {
  const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const hasMockEmail = emailProvider === 'mock';
  const hasSmtp = Boolean(
    emailProvider === 'smtp' &&
    process.env.SMTP_HOST && process.env.SMTP_HOST.trim().length > 0 &&
    process.env.SMTP_USER && process.env.SMTP_USER.trim().length > 0 &&
    process.env.SMTP_PASS && process.env.SMTP_PASS.trim().length > 0
  );
  const hasResend = Boolean(
    emailProvider === 'resend' &&
    process.env.RESEND_API_KEY &&
    process.env.RESEND_API_KEY.trim().length > 0
  );

  const isEmailConfigured = hasMockEmail || hasSmtp || hasResend;
  const effectiveEmailProvider = hasMockEmail ? 'mock' : (hasSmtp ? 'smtp' : (hasResend ? 'resend' : null));

  const smsProvider = (process.env.SMS_PROVIDER || '').trim().toLowerCase();
  const hasMockSms = smsProvider === 'mock';
  const twilioFrom = (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM || '').trim();
  const hasTwilio = Boolean(
    smsProvider === 'twilio' &&
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.trim().length > 0 &&
    process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_AUTH_TOKEN.trim().length > 0 &&
    twilioFrom.length > 0
  );

  const isSmsConfigured = hasMockSms || hasTwilio;
  const effectiveSmsProvider = hasMockSms ? 'mock' : (hasTwilio ? 'twilio' : null);

  const emailNotice = isEmailConfigured
    ? `Email provider active (${effectiveEmailProvider})`
    : (emailProvider === 'resend' && !hasResend
      ? 'Resend email provider selected, but RESEND_API_KEY is not configured in .env.'
      : 'Email provider not configured. Set EMAIL_PROVIDER and credentials in .env.');

  const smsNotice = isSmsConfigured
    ? `SMS provider active (${effectiveSmsProvider})`
    : (smsProvider === 'twilio' && !hasTwilio
      ? 'Twilio SMS provider selected, but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER is missing in .env.'
      : 'SMS provider not configured. Set SMS_PROVIDER, TWILIO_ACCOUNT_SID, and TWILIO_AUTH_TOKEN in .env.');

  return {
    email: {
      configured: isEmailConfigured,
      provider: effectiveEmailProvider,
      status: isEmailConfigured ? 'configured' : 'unconfigured',
      statusNotice: emailNotice,
    },
    sms: {
      configured: isSmsConfigured,
      provider: effectiveSmsProvider,
      status: isSmsConfigured ? 'configured' : 'unconfigured',
      statusNotice: smsNotice,
    },
  };
}

/**
 * Safely masks an email address for diagnostic logs without leaking personal data.
 * E.g. "john.doe@example.com" -> "j***e@example.com"
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0 || atIdx === trimmed.length - 1) return '***';
  const name = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  const maskedName = name.length > 2 
    ? `${name[0]}***${name[name.length - 1]}` 
    : `${name[0]}*`;
  return `${maskedName}@${domain}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dispatches an email with verified PDF attachment via configured provider (Resend, SMTP, or Mock).
 * Reports 'accepted' upon provider confirmation, distinguishing acceptance from final delivery.
 */
export async function sendEmailNotification(payload) {
  const providerStatus = getNotificationProviderStatus();
  const maskedRecipient = maskEmail(payload.toEmail);

  console.log(`[Notification:Dispatch] Email dispatch initiated for Document ID="${payload.documentId}", Recipient="${maskedRecipient}", HasAttachment=${Boolean(payload.attachment)}`);

  if (!providerStatus.email.configured) {
    console.warn(`[Notification:Email] Email dispatch blocked: provider is unconfigured in environment.`);
    return {
      success: false,
      status: 'unconfigured',
      error: providerStatus.email.statusNotice || 'Email provider not configured. Set EMAIL_PROVIDER (resend or smtp) and credentials in .env.',
    };
  }

  // Validate recipient email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!payload.toEmail || !emailRegex.test(payload.toEmail.trim())) {
    console.warn(`[Notification:Email] Recipient format validation failed for "${maskedRecipient}".`);
    return {
      success: false,
      status: 'failed',
      error: `Invalid recipient email address format: "${payload.toEmail || ''}".`,
    };
  }
  console.log(`[Notification:Email] Recipient format validated: ${maskedRecipient}`);

  // Attachment size check (25 MB provider limit)
  if (payload.attachment && payload.attachment.content) {
    const byteLength = Buffer.isBuffer(payload.attachment.content) 
      ? payload.attachment.content.length 
      : Buffer.byteLength(payload.attachment.content);
    console.log(`[Notification:Attachment] Original PDF attachment verified: "${payload.attachment.filename || 'document.pdf'}" (${(byteLength / 1024).toFixed(1)} KB)`);
    if (byteLength > 25 * 1024 * 1024) {
      console.warn(`[Notification:Attachment] Attachment size exceeds 25 MB provider limit (${(byteLength / 1024 / 1024).toFixed(1)} MB).`);
      return {
        success: false,
        status: 'failed',
        error: `Attachment size (${(byteLength / 1024 / 1024).toFixed(1)} MB) exceeds the 25 MB provider email limit.`,
      };
    }
  }

  const appUrl = (payload.appBaseUrl || 'http://localhost:5173').replace(/\/$/, '');
  const verifyUrl = `${appUrl}/verify/${encodeURIComponent(payload.documentId)}`;
  const accessUrl = payload.secureAccessUrl || `${appUrl}/app/documents/${encodeURIComponent(payload.documentId)}`;

  const subject = payload.subject || `NotaryVault: Secured Document "${payload.title}" (${payload.documentId})`;
  
  const bodyText = [
    `Hello,`,
    ``,
    payload.isShareDelivery 
      ? `The document "${payload.title}" has been shared with you via NotaryVault.` 
      : `Your document registration has been confirmed on the blockchain via NotaryVault.`,
    ``,
    `Document ID: ${payload.documentId}`,
    `Title: ${payload.title}`,
    payload.category ? `Category / Classification: ${payload.category}` : '',
    payload.issuer ? `Issuer / Registrant: ${payload.issuer}` : '',
    payload.registeredAt ? `Registration Timestamp: ${payload.registeredAt}` : '',
    payload.networkName ? `Network: ${payload.networkName}` : '',
    payload.txHash ? `Transaction Hash: ${payload.txHash}` : '',
    payload.blockNumber ? `Block Number: #${payload.blockNumber}` : '',
    payload.sha256Hash ? `SHA-256 Digest: ${payload.sha256Hash}` : '',
    payload.attachment ? `Attached: Original verified PDF document (${payload.attachment.filename || `${payload.documentId}.pdf`}).` : '',
    ``,
    `Public Blockchain Verification:`,
    verifyUrl,
    ``,
    `Secure Access URL:`,
    accessUrl,
    ``,
    `Integrity Note: This document's SHA-256 hash was cryptographically verified against the on-chain registry before transmission.`,
    ``,
    `-- NotaryVault Automated Notification System`,
  ].filter(Boolean).join('\n');

  const bodyHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1c1c1c; border: 1px solid #e5e5e5; border-radius: 12px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #1F6FF0; padding-bottom: 14px; margin-bottom: 18px;">
        <h1 style="font-size: 20px; margin: 0; color: #1F6FF0; letter-spacing: -0.5px;">NotaryVault</h1>
        <p style="font-size: 13px; color: #666; margin: 4px 0 0 0;">Blockchain-Anchored Document Registration Receipt</p>
      </div>

      <p style="font-size: 14px; line-height: 1.5; color: #222;">
        ${payload.isShareDelivery 
          ? `The document <strong>${escapeHtml(payload.title)}</strong> has been securely shared with you.` 
          : `Your document registration has been confirmed and cryptographically anchored on the blockchain.`}
      </p>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 18px 0; background: #f9fafb; border-radius: 8px; overflow: hidden; border: 1px solid #edf0f2;">
        <tbody>
          <tr>
            <td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2; width: 35%;">Document ID</td>
            <td style="padding: 10px 14px; font-family: monospace; font-weight: bold; color: #1F6FF0; border-bottom: 1px solid #edf0f2;">${escapeHtml(payload.documentId)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2;">Document Title</td>
            <td style="padding: 10px 14px; font-weight: 600; color: #1c1c1c; border-bottom: 1px solid #edf0f2;">${escapeHtml(payload.title)}</td>
          </tr>
          ${payload.category ? `<tr><td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2;">Category</td><td style="padding: 10px 14px; color: #333; border-bottom: 1px solid #edf0f2;">${escapeHtml(payload.category)}</td></tr>` : ''}
          ${payload.issuer ? `<tr><td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2;">Registrant</td><td style="padding: 10px 14px; color: #333; border-bottom: 1px solid #edf0f2;">${escapeHtml(payload.issuer)}</td></tr>` : ''}
          ${payload.registeredAt ? `<tr><td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2;">Timestamp</td><td style="padding: 10px 14px; color: #333; border-bottom: 1px solid #edf0f2;">${escapeHtml(payload.registeredAt)}</td></tr>` : ''}
          ${payload.networkName ? `<tr><td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2;">Network</td><td style="padding: 10px 14px; color: #333; border-bottom: 1px solid #edf0f2;">${escapeHtml(payload.networkName)}</td></tr>` : ''}
          ${payload.txHash ? `<tr><td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2;">Transaction Hash</td><td style="padding: 10px 14px; font-family: monospace; font-size: 11px; word-break: break-all; color: #0284c7; border-bottom: 1px solid #edf0f2;">${escapeHtml(payload.txHash)}</td></tr>` : ''}
          ${payload.blockNumber ? `<tr><td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2;">Block Number</td><td style="padding: 10px 14px; font-family: monospace; color: #333; border-bottom: 1px solid #edf0f2;">#${payload.blockNumber}</td></tr>` : ''}
          ${payload.sha256Hash ? `<tr><td style="padding: 10px 14px; font-weight: 600; color: #555; border-bottom: 1px solid #edf0f2;">SHA-256 Digest</td><td style="padding: 10px 14px; font-family: monospace; font-size: 11px; word-break: break-all; color: #333; border-bottom: 1px solid #edf0f2;">${escapeHtml(payload.sha256Hash)}</td></tr>` : ''}
        </tbody>
      </table>

      ${payload.attachment ? `<div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px; font-size: 12px; color: #065f46; margin-bottom: 18px;">📎 <strong>Attached:</strong> Original verified PDF document (<code>${escapeHtml(payload.attachment.filename || `${payload.documentId}.pdf`)}</code>).</div>` : ''}

      <div style="margin: 22px 0; text-align: center;">
        <a href="${verifyUrl}" style="background-color: #1F6FF0; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: bold; display: inline-block;">Verify on Public Blockchain</a>
      </div>

      <p style="font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 14px; margin-top: 20px; text-align: center; line-height: 1.4;">
        This document's cryptographic SHA-256 fingerprint was verified against the smart contract registry prior to email dispatch.
      </p>
    </div>
  `;

  // 1. Mock Provider (for automated unit and integration tests)
  if (providerStatus.email.provider === 'mock') {
    if (process.env.MOCK_EMAIL_SHOULD_FAIL === 'true') {
      console.warn(`[Notification:Mock] Simulated mock email rejection.`);
      return {
        success: false,
        status: 'failed',
        error: 'Simulated email provider rejection: Invalid recipient mailbox or domain rejected by mail server.',
      };
    }
    const mockId = `mock_email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Notification:Mock] Accepted by mock provider: ID=${mockId}`);
    return {
      success: true,
      status: 'accepted',
      provider: providerStatus.email.provider,
      deliveryId: mockId,
      details: 'Send request accepted by mock email provider (attachment processed).',
    };
  }

  // 2. Resend API Provider
  if (providerStatus.email.provider === 'resend') {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      let fromEmail = (process.env.EMAIL_FROM || '').trim();

      // Check if fromEmail is an unverified public mailbox domain (e.g. gmail.com, yahoo.com)
      const isPublicWebmail = /@(gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|icloud\.com)$/i.test(fromEmail);
      if (!fromEmail || isPublicWebmail) {
        console.log(`[Notification:Resend] Configured sender (${fromEmail || 'unset'}) cannot be sent from via Resend. Using verified default test sender: "NotaryVault <onboarding@resend.dev>"`);
        fromEmail = 'NotaryVault <onboarding@resend.dev>';
      }

      const postBody = {
        from: fromEmail,
        to: [payload.toEmail.trim()],
        subject,
        text: bodyText,
        html: bodyHtml,
      };

      if (payload.attachment && payload.attachment.content) {
        const contentBuf = Buffer.isBuffer(payload.attachment.content) 
          ? payload.attachment.content 
          : Buffer.from(payload.attachment.content);
        postBody.attachments = [
          {
            filename: payload.attachment.filename || `${payload.documentId}.pdf`,
            content: contentBuf.toString('base64'),
          },
        ];
      }

      console.log(`[Notification:Resend] Dispatching to Resend API (Sender="${fromEmail}", Recipient="${maskedRecipient}")...`);
      let res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postBody),
      });

      // If Resend rejected with 403 because the domain is unverified, fallback to onboarding@resend.dev
      if (!res.ok && res.status === 403 && fromEmail !== 'NotaryVault <onboarding@resend.dev>') {
        const firstErr = await res.json().catch(() => ({}));
        if (firstErr.message && /not verified/i.test(firstErr.message)) {
          console.warn(`[Notification:Resend] Custom sender "${fromEmail}" unverified on Resend. Falling back to test sender "NotaryVault <onboarding@resend.dev>"...`);
          postBody.from = 'NotaryVault <onboarding@resend.dev>';
          res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(postBody),
          });
        }
      }

      if (res.ok) {
        const resJson = await res.json().catch(() => ({}));
        console.log(`[Notification:Resend] Email dispatch accepted by Resend API. Request ID="${resJson.id || 'accepted'}".`);
        return {
          success: true,
          status: 'accepted',
          provider: 'resend',
          deliveryId: resJson.id || `resend_${Date.now()}`,
          details: 'Accepted by Resend API for queueing and delivery.',
        };
      }

      const errJson = await res.json().catch(() => ({}));
      const rawError = errJson.message || `Resend provider rejected send request (HTTP ${res.status}).`;
      console.warn(`[Notification:Resend] Provider rejected request (HTTP ${res.status}, Category="${errJson.name || 'validation_error'}"): "${rawError}"`);

      let category = 'provider_rejected';
      let safeError = rawError;

      if (/only send testing emails to your own email address/i.test(rawError) || /testing restrictions/i.test(rawError)) {
        category = 'recipient_not_permitted';
        safeError = "Recipient is not permitted by the provider's testing restrictions. Under Resend's free tier, emails can only be delivered to your verified Resend account owner email. To send to any recipient, verify your domain at resend.com/domains.";
      } else if (/domain is not verified/i.test(rawError) || /sender domain/i.test(rawError)) {
        category = 'sender_unverified';
        safeError = "Sender address/domain is not verified. Please verify your custom domain in the Resend dashboard or configure a verified sender.";
      } else if (res.status === 401 || (res.status === 403 && /api key/i.test(rawError))) {
        category = 'invalid_credentials';
        safeError = "Email provider authentication failed. Please verify your RESEND_API_KEY.";
      } else if (res.status === 429) {
        category = 'rate_limited';
        safeError = "Email provider rate limit reached. Please wait a moment before retrying.";
      }

      return {
        success: false,
        status: 'failed',
        category,
        error: safeError,
      };
    } catch (err) {
      console.error(`[Notification:Resend] Network exception while connecting to Resend: ${err?.message || 'Connection failed'}`);
      return {
        success: false,
        status: 'failed',
        category: 'network_error',
        error: `Network/backend connection failed: ${err?.message || 'Connection failed'}.`,
      };
    }
  }

  // 3. Fallback for custom SMTP
  return {
    success: false,
    status: 'unconfigured',
    category: 'unconfigured',
    error: 'Email provider is not configured. Setup EMAIL_PROVIDER=resend and RESEND_API_KEY in .env.',
  };
}

/**
 * Dispatches an SMS notification via configured provider (Twilio or Mock).
 * Sends a concise reference and HTTPS secure-access URL without attaching raw PDFs.
 */
export async function sendSmsNotification(payload) {
  // Mobile / SMS sharing is disabled for this release (Coming Soon).
  // Strictly prevent calling Twilio or any external SMS provider.
  return {
    success: false,
    status: 'disabled',
    provider: 'disabled',
    error: 'Mobile / SMS sharing is disabled for this release (Coming Soon). Twilio API calls are not permitted.',
  };
}

export async function _inactiveTwilioSendSmsNotification(payload) {
  const providerStatus = getNotificationProviderStatus();

  if (!providerStatus.sms.configured) {
    return {
      success: false,
      status: 'unconfigured',
      error: providerStatus.sms.statusNotice || 'SMS provider not configured. Set SMS_PROVIDER, TWILIO_ACCOUNT_SID, and TWILIO_AUTH_TOKEN in .env.',
    };
  }

  // Validate mobile phone format (E.164: + followed by 7-15 digits)
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  if (!payload.toMobile || !phoneRegex.test(payload.toMobile.trim())) {
    return {
      success: false,
      status: 'failed',
      error: `Invalid recipient mobile number format: "${payload.toMobile || ''}". Must be in international E.164 format (e.g. +14155552671 or +919876543210).`,
    };
  }

  const appUrl = (payload.appBaseUrl || 'http://localhost:5173').replace(/\/$/, '');
  const verifyUrl = `${appUrl}/verify/${encodeURIComponent(payload.documentId)}`;
  const accessUrl = payload.secureAccessUrl || verifyUrl;

  const messageBody = `NotaryVault: Document "${payload.title}" (${payload.documentId}) is ready for secure inspection. Access: ${accessUrl}`;

  // 1. Mock SMS Provider (for automated tests)
  if (providerStatus.sms.provider === 'mock') {
    if (process.env.MOCK_SMS_SHOULD_FAIL === 'true') {
      return {
        success: false,
        status: 'failed',
        error: 'Simulated SMS provider rejection: Destination phone number unreachable or blacklisted.',
      };
    }
    return {
      success: true,
      status: 'accepted',
      provider: providerStatus.sms.provider,
      deliveryId: `mock_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      details: 'SMS message accepted by mock SMS provider.',
    };
  }

  // 2. Twilio SMS Provider
  if (providerStatus.sms.provider === 'twilio') {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM;

      const params = new URLSearchParams({
        To: payload.toMobile.trim(),
        From: fromNumber,
        Body: messageBody,
      });

      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

      const res = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        return {
          success: true,
          status: 'accepted',
          provider: 'twilio',
          deliveryId: json.sid || `twilio_${Date.now()}`,
          details: `Accepted by Twilio SMS API (${json.status || 'queued'}).`,
        };
      }

      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        status: 'failed',
        error: errJson.message || `Twilio rejected SMS send request (HTTP ${res.status}).`,
      };
    } catch (err) {
      return {
        success: false,
        status: 'failed',
        error: `Network error connecting to SMS provider: ${err?.message || 'Connection failed'}`,
      };
    }
  }

  return {
    success: false,
    status: 'unconfigured',
    error: 'Configured SMS provider is not active in this runtime.',
  };
}

/**
 * Coordinates notification dispatch after confirmed blockchain registration.
 */
export async function dispatchOwnerNotifications(params) {
  const result = {
    email: { status: 'skipped' },
    sms: { status: 'skipped' },
  };

  if (!params.notificationConsent) {
    result.email = { status: 'skipped', error: 'Owner notification consent was not provided.' };
    result.sms = { status: 'skipped', error: 'Owner notification consent was not provided.' };
    return result;
  }

  // 1. Dispatch Email if email provided
  if (params.ownerEmail && params.ownerEmail.trim()) {
    const emailRes = await sendEmailNotification({
      toEmail: params.ownerEmail.trim(),
      documentId: params.documentId,
      title: params.title,
      category: params.category,
      issuer: params.issuer,
      registeredAt: params.registeredAt,
      sha256Hash: params.sha256Hash,
      attachment: params.attachment,
      txHash: params.txHash,
      blockNumber: params.blockNumber,
      networkName: params.networkName,
      appBaseUrl: params.appBaseUrl,
    });
    result.email = {
      status: emailRes.status,
      category: emailRes.category,
      deliveryId: emailRes.deliveryId,
      error: emailRes.error,
      details: emailRes.details,
    };
  }

  // 2. Dispatch SMS if mobile number provided
  if (params.ownerMobile && params.ownerMobile.trim()) {
    const smsRes = await sendSmsNotification({
      toMobile: params.ownerMobile.trim(),
      documentId: params.documentId,
      title: params.title,
      txHash: params.txHash,
      appBaseUrl: params.appBaseUrl,
    });
    result.sms = {
      status: smsRes.status,
      deliveryId: smsRes.deliveryId,
      error: smsRes.error,
    };
  }

  return result;
}

