/**
 * QR Code utilities for NotaryVault.
 * Generates document-specific verification URLs and handles high-resolution PNG exports.
 */

import { normalizeDocumentId } from './id.ts';

/**
 * Builds the canonical public verification URL for a specific Document ID.
 * Avoids any hardcoded document information; strictly derived from the document's ID.
 */
export function buildPublicVerificationUrl(documentId: string, customOrigin?: string): string {
  const cleanId = normalizeDocumentId(documentId);
  const baseOrigin = customOrigin || (typeof window !== 'undefined' && window.location ? window.location.origin : '');
  const path = `/verify/${encodeURIComponent(cleanId)}`;
  return baseOrigin ? `${baseOrigin}${path}` : path;
}

/**
 * Downloads a rendered QR code SVG element as a crisp PNG image with Document ID caption.
 */
export function downloadQRCodeAsPNG(
  svgElementId: string,
  documentId: string,
  onComplete?: (success: boolean, message?: string) => void
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    onComplete?.(false, 'DOM not available.');
    return;
  }

  const svg = document.getElementById(svgElementId) as SVGSVGElement | null;
  if (!svg) {
    onComplete?.(false, 'QR code SVG element not found.');
    return;
  }

  try {
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = 2; // Crisp 2x retina export
        const padding = 24 * scale;
        const labelHeight = 40 * scale;

        canvas.width = img.width * scale + padding * 2;
        canvas.height = img.height * scale + padding * 2 + labelHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          onComplete?.(false, 'Canvas context not available.');
          return;
        }

        // Clean white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle frame border
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1 * scale;
        ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

        // Draw QR SVG scaled
        ctx.drawImage(img, padding, padding, img.width * scale, img.height * scale);

        // Document ID caption
        ctx.fillStyle = '#1C1C1C';
        ctx.font = `bold ${12 * scale}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`ID: ${documentId}`, canvas.width / 2, padding + img.height * scale + 24 * scale);

        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            onComplete?.(false, 'Failed to create PNG blob.');
            return;
          }
          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `NotaryVault-QR-${documentId}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
          onComplete?.(true, `NotaryVault-QR-${documentId}.png downloaded.`);
        }, 'image/png');
      } catch (err: any) {
        URL.revokeObjectURL(url);
        onComplete?.(false, err?.message || 'PNG conversion failed.');
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      onComplete?.(false, 'Failed to load QR code image for conversion.');
    };

    img.src = url;
  } catch (err: any) {
    onComplete?.(false, err?.message || 'Export failed.');
  }
}
