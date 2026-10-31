import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Storage Provider for NotaryVault.
 * 
 * Supports:
 * 1. S3-Compatible Private Object Storage (Cloudflare R2, AWS S3, Supabase Storage, MinIO, Backblaze B2)
 *    - Enabled when S3_BUCKET is provided in environment.
 *    - Uses AWS Signature Version 4 (SigV4) via built-in crypto & fetch (zero extra dependencies).
 * 2. Persistent Local Filesystem Storage (for local development or Docker persistent volume mounts)
 *    - Default fallback when S3 credentials are not set.
 */

// Helper to compute SHA-256 hex digest
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex').toLowerCase();
}

// AWS SigV4 implementation for S3 REST API (PutObject, GetObject, HeadObject, DeleteObject)
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

export class S3StorageClient {
  constructor(config) {
    this.bucket = config.bucket;
    this.region = config.region || 'auto';
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.endpoint = (config.endpoint || '').replace(/\/$/, '');
    this.forcePathStyle = config.forcePathStyle !== false; // Default true for R2, MinIO, Supabase
  }

  getRequestUrl(key) {
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    if (this.endpoint) {
      if (this.forcePathStyle) {
        return `${this.endpoint}/${this.bucket}/${encodedKey}`;
      } else {
        const url = new URL(this.endpoint);
        return `${url.protocol}//${this.bucket}.${url.host}/${encodedKey}`;
      }
    }
    // AWS S3 default
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }

  async sendRequest(method, key, body = null, headers = {}) {
    const urlStr = this.getRequestUrl(key);
    const url = new URL(urlStr);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = body ? sha256(body) : sha256('');

    const reqHeaders = {
      ...headers,
      'host': url.host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    // Canonical request
    const headerKeys = Object.keys(reqHeaders).map(k => k.toLowerCase()).sort();
    const canonicalHeaders = headerKeys.map(k => `${k}:${reqHeaders[k]}\n`).join('');
    const signedHeaders = headerKeys.join(';');

    const canonicalRequest = [
      method,
      url.pathname,
      url.search ? url.search.slice(1) : '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');

    const signingKey = getSignatureKey(this.secretAccessKey, dateStamp, this.region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(urlStr, {
      method,
      headers: {
        ...reqHeaders,
        'Authorization': authHeader,
      },
      body: body || undefined,
    });
  }

  async putObject(key, buffer, contentType = 'application/pdf', metadata = {}) {
    const extraHeaders = {
      'content-type': contentType,
    };
    if (metadata.sha256) {
      extraHeaders['x-amz-meta-sha256'] = metadata.sha256;
    }
    if (metadata.filename) {
      extraHeaders['x-amz-meta-filename'] = encodeURIComponent(metadata.filename);
    }
    const res = await this.sendRequest('PUT', key, buffer, extraHeaders);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`S3 PutObject failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
    }
    return true;
  }

  async getObject(key) {
    const res = await this.sendRequest('GET', key);
    if (!res.ok) {
      if (res.status === 404) return null;
      const errText = await res.text().catch(() => '');
      throw new Error(`S3 GetObject failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async headObject(key) {
    const res = await this.sendRequest('HEAD', key);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`S3 HeadObject failed (HTTP ${res.status})`);
    }
    return {
      size: parseInt(res.headers.get('content-length') || '0', 10),
      contentType: res.headers.get('content-type') || 'application/pdf',
      sha256: res.headers.get('x-amz-meta-sha256') || null,
      filename: res.headers.get('x-amz-meta-filename') ? decodeURIComponent(res.headers.get('x-amz-meta-filename')) : null,
    };
  }

  async deleteObject(key) {
    const res = await this.sendRequest('DELETE', key);
    return res.ok || res.status === 204;
  }
}

/**
 * StorageProvider manages saving and retrieving PDFs across either S3 cloud storage or local disk.
 */
export class StorageProvider {
  constructor(options = {}) {
    this.uploadsDir = options.uploadsDir || path.resolve(process.cwd(), 'storage/uploads');

    // Auto-detect S3 configuration
    const isS3Configured = Boolean(
      (process.env.STORAGE_PROVIDER === 's3' || process.env.S3_BUCKET) &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
    );

    if (isS3Configured) {
      this.type = 's3_compatible';
      this.s3 = new S3StorageClient({
        bucket: process.env.S3_BUCKET.trim(),
        region: (process.env.S3_REGION || 'auto').trim(),
        accessKeyId: process.env.S3_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY.trim(),
        endpoint: (process.env.S3_ENDPOINT || '').trim(),
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      });
      console.log(`[StorageProvider] S3-compatible cloud object storage active (Bucket="${process.env.S3_BUCKET}", Endpoint="${process.env.S3_ENDPOINT || 'AWS Default'}").`);
    } else {
      this.type = 'local_filesystem';
      this.s3 = null;
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      }
      console.log(`[StorageProvider] Local filesystem storage active (Directory="${this.uploadsDir}").`);
    }
  }

  isCloudStorage() {
    return this.type === 's3_compatible';
  }

  getStorageType() {
    return this.type;
  }

  /**
   * Generates canonical object key / stored path for a Document ID.
   */
  getStorageKey(documentId) {
    const cleanId = documentId.trim().toUpperCase();
    return `${cleanId}.pdf`;
  }

  /**
   * Saves original PDF bytes to storage.
   */
  async savePdf(documentId, buffer, meta = {}) {
    const cleanId = documentId.trim().toUpperCase();
    const storedPath = this.getStorageKey(cleanId);
    const hash = sha256(buffer);

    if (this.s3) {
      const s3Key = `documents/${storedPath}`;
      await this.s3.putObject(s3Key, buffer, 'application/pdf', {
        sha256: hash,
        filename: meta.fileName || `${cleanId}.pdf`,
      });
      return {
        storedPath: `s3://${s3Key}`,
        sha256Hash: hash,
        size: buffer.length,
        storageType: 's3',
      };
    } else {
      // Local disk
      const fullPath = path.resolve(this.uploadsDir, storedPath);
      if (!fullPath.startsWith(this.uploadsDir)) {
        throw new Error('Path traversal detected.');
      }
      fs.writeFileSync(fullPath, buffer);
      return {
        storedPath,
        sha256Hash: hash,
        size: buffer.length,
        storageType: 'local',
      };
    }
  }

  /**
   * Retrieves original PDF bytes.
   */
  async getPdf(documentId, storedPath) {
    const cleanId = documentId.trim().toUpperCase();
    const pathStr = storedPath || this.getStorageKey(cleanId);

    if (pathStr.startsWith('s3://') || this.s3) {
      if (!this.s3) {
        throw new Error('Document was stored in S3, but S3 credentials are not configured in this runtime.');
      }
      const s3Key = pathStr.startsWith('s3://') ? pathStr.slice(5) : `documents/${pathStr}`;
      return await this.s3.getObject(s3Key);
    } else {
      const fullPath = path.resolve(this.uploadsDir, pathStr);
      if (!fullPath.startsWith(this.uploadsDir) || !fs.existsSync(fullPath)) {
        return null;
      }
      return fs.readFileSync(fullPath);
    }
  }

  /**
   * Verifies that PDF exists and matches expected hash.
   */
  async verifyStorage(documentId, storedPath, expectedHash) {
    const bytes = await this.getPdf(documentId, storedPath);
    if (!bytes) {
      return {
        exists: false,
        error: 'Original PDF file was not found in storage.',
      };
    }
    const computed = sha256(bytes);
    const cleanExpected = (expectedHash || '').trim().toLowerCase().replace(/^0x/, '');
    const matches = !cleanExpected || computed === cleanExpected;

    return {
      exists: true,
      size: bytes.length,
      sha256Hash: `0x${computed}`,
      matches,
      error: matches ? null : `Stored file SHA-256 (0x${computed}) does not match expected hash (0x${cleanExpected}).`,
    };
  }

  /**
   * Deletes a PDF file.
   */
  async deletePdf(documentId, storedPath) {
    const cleanId = documentId.trim().toUpperCase();
    const pathStr = storedPath || this.getStorageKey(cleanId);

    if (pathStr.startsWith('s3://') || this.s3) {
      if (this.s3) {
        const s3Key = pathStr.startsWith('s3://') ? pathStr.slice(5) : `documents/${pathStr}`;
        return await this.s3.deleteObject(s3Key);
      }
      return false;
    } else {
      const fullPath = path.resolve(this.uploadsDir, pathStr);
      if (fullPath.startsWith(this.uploadsDir) && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return true;
      }
      return false;
    }
  }
}

export function createStorageProvider(options) {
  return new StorageProvider(options);
}
