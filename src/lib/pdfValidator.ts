export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Maximum allowed PDF upload size: exactly 50 MB (52,428,800 bytes).
 * Note: 50 MB is the MAXIMUM allowed file size, NOT a minimum or required size.
 * Any valid non-empty PDF up to 52,428,800 bytes (e.g. 100 KB, 500 KB, 1 MB, 20 MB, 50 MB) is accepted.
 */
export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024; // 52,428,800 bytes
export const MAX_PDF_SIZE_LABEL = '50 MB';
export const PDF_SIZE_NOTICE = 'Maximum PDF size: 50 MB. Smaller PDF files are accepted.';

export interface PdfValidationResult {
  valid: boolean;
  error?: string;
  fileSizeBytes: number;
  formattedSize: string;
  pageCount?: number;
  pdfVersion?: string;
}

/**
 * Validates a PDF file according to NotaryVault requirements:
 * 1. File size must be > 0 bytes (reject empty files).
 * 2. File size must be <= 50 MB (52,428,800 bytes).
 * 3. File must contain a genuine PDF magic byte header (%PDF-).
 * 4. Extracts metadata (page count, version) when available without altering original bytes.
 */
export async function validatePdfFile(file: File | Blob, fileName?: string): Promise<PdfValidationResult> {
  const size = file.size;
  const formattedSize = formatFileSize(size);

  // 1. Check for empty file
  if (size === 0) {
    return {
      valid: false,
      error: 'Empty file detected (0 bytes). Please upload a valid non-empty PDF document.',
      fileSizeBytes: 0,
      formattedSize: '0 B',
    };
  }

  // 2. Check maximum size (50 MB)
  if (size > MAX_PDF_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${formattedSize}) exceeds the maximum allowed limit of 50 MB (52,428,800 bytes). Please choose a PDF file up to 50 MB. Smaller PDF files are accepted.`,
      fileSizeBytes: size,
      formattedSize,
    };
  }

  // 3. Filename check if provided
  const name = fileName || (file instanceof File ? file.name : '');
  if (name && !name.toLowerCase().endsWith('.pdf')) {
    return {
      valid: false,
      error: `Invalid file type for "${name}". Only valid PDF documents (.pdf) are accepted.`,
      fileSizeBytes: size,
      formattedSize,
    };
  }

  // 4. Magic bytes inspection (first 1024 bytes)
  try {
    const headerSlice = await file.slice(0, Math.min(size, 1024)).arrayBuffer();
    const headerBytes = new Uint8Array(headerSlice);
    const headerStr = new TextDecoder('latin1').decode(headerBytes);

    // PDF files must start with or contain %PDF- in the initial header block
    const pdfIndex = headerStr.indexOf('%PDF-');
    if (pdfIndex === -1) {
      return {
        valid: false,
        error: 'Malformed or non-PDF file: Missing standard %PDF- header signature.',
        fileSizeBytes: size,
        formattedSize,
      };
    }

    // Extract PDF version if present (e.g., %PDF-1.4 -> "1.4")
    let pdfVersion: string | undefined;
    const versionMatch = headerStr.match(/%PDF-(\d+\.\d+)/);
    if (versionMatch) {
      pdfVersion = versionMatch[1];
    }

    // 5. Lightweight page count estimation via scanning object dictionaries
    let pageCount: number | undefined;
    try {
      // Sample up to first 2MB and last 512KB for page objects
      const sampleLimit = Math.min(size, 2 * 1024 * 1024);
      const sampleSlice = await file.slice(0, sampleLimit).arrayBuffer();
      const sampleText = new TextDecoder('latin1').decode(new Uint8Array(sampleSlice));
      
      // Look for /Count N in /Pages dict
      const countMatch = sampleText.match(/\/Type\s*\/Pages[\s\S]{0,100}\/Count\s+(\d+)/);
      if (countMatch) {
        pageCount = parseInt(countMatch[1], 10);
      } else {
        // Fallback: count individual /Type /Page occurrences
        const pageMatches = sampleText.match(/\/Type\s*\/Page[^s]/g);
        if (pageMatches && pageMatches.length > 0) {
          pageCount = pageMatches.length;
        }
      }
    } catch {
      // Page count estimation is optional; failure does not invalidate the file
    }

    return {
      valid: true,
      fileSizeBytes: size,
      formattedSize,
      pageCount,
      pdfVersion,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Failed to inspect PDF header: ${err?.message || 'Read error'}`,
      fileSizeBytes: size,
      formattedSize,
    };
  }
}
