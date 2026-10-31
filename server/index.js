import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { verifyMessage, JsonRpcProvider, Contract } from 'ethers';
import { 
  getNotificationProviderStatus, 
  dispatchOwnerNotifications,
  sendEmailNotification,
  sendSmsNotification
} from './notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads environment variables from project root .env into process.env without overwriting existing settings.
 */
export function loadEnv(envPath) {
  const candidatePaths = [
    envPath,
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
  ].filter(Boolean);

  const resolvedPath = candidatePaths.find(p => fs.existsSync(p));
  if (!resolvedPath) return false;

  try {
    let content = fs.readFileSync(resolvedPath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = val;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Automatically load project root .env upon initialization
loadEnv();

// Constants
export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024; // 52,428,800 bytes (50 MB)
export const DEFAULT_PORT = process.env.STORAGE_SERVER_PORT 
  ? parseInt(process.env.STORAGE_SERVER_PORT, 10) 
  : (process.env.PORT ? parseInt(process.env.PORT, 10) : 5001);

const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

/**
 * Validates canonical Document ID format and prevents path traversal attacks.
 */
export function validateCanonicalDocumentId(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Document ID is required.' };
  }
  const clean = id.trim();
  // Check for forbidden characters (path traversal, control chars, delimiters)
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\') || clean.includes('\0')) {
    return { valid: false, error: 'Path traversal detected in Document ID.' };
  }
  // Enforce standard NotaryVault ID pattern (e.g. NV-2026-000101, NV-2026-566456)
  const pattern = /^NV-\d{4}-[A-Za-z0-9_-]+$/;
  if (!pattern.test(clean)) {
    return { valid: false, error: 'Document ID does not conform to canonical pattern (e.g. NV-2026-XXXXXX).' };
  }
  return { valid: true, cleanId: clean.toUpperCase() };
}

/**
 * Normalizes any SHA-256 hash string to a canonical 64-character lowercase hex digest
 * without leading 0x prefix.
 */
export function normalizeSha256Hex(hash) {
  if (!hash || typeof hash !== 'string') return '';
  const clean = hash.trim().toLowerCase();
  return (clean.startsWith('0x') || clean.startsWith('0X')) ? clean.slice(2) : clean;
}

/**
 * Compares two SHA-256 hashes for cryptographic equality, handling 0x prefix and case consistently.
 */
export function areSha256HexEqual(h1, h2) {
  const n1 = normalizeSha256Hex(h1);
  const n2 = normalizeSha256Hex(h2);
  return n1.length === 64 && n1 === n2;
}

/**
 * Resolves the active Super Author address from environment variables or deployment config.
 */
export function getSuperAuthorAddress() {
  if (process.env.SUPER_AUTHOR_ADDRESS && /^0x[0-9a-fA-F]{40}$/.test(process.env.SUPER_AUTHOR_ADDRESS)) {
    return process.env.SUPER_AUTHOR_ADDRESS.trim().toLowerCase();
  }
  if (process.env.CONTRACT_ADMIN_ADDRESS && /^0x[0-9a-fA-F]{40}$/.test(process.env.CONTRACT_ADMIN_ADDRESS)) {
    return process.env.CONTRACT_ADMIN_ADDRESS.trim().toLowerCase();
  }
  try {
    const deploymentPath = path.resolve(__dirname, '../src/contracts/deployment.json');
    if (fs.existsSync(deploymentPath)) {
      const data = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      const addr = data.testnet?.deployerAddress || data.mainnet?.deployerAddress || data.deployerAddress;
      if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
        return addr.trim().toLowerCase();
      }
    }
  } catch {}
  return '0x6d9618b1ee522d22f3c168b40a33466a89af00c4';
}

/**
 * Checks whether an address is an authorized Super Author.
 */
export function isSuperAuthorAddress(addr) {
  if (!addr || typeof addr !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(addr.trim())) {
    return false;
  }
  const clean = addr.trim().toLowerCase();
  if (clean === getSuperAuthorAddress()) return true;

  const envAdmin = (process.env.CONTRACT_ADMIN_ADDRESS || process.env.SUPER_AUTHOR_ADDRESS || '').trim().toLowerCase();
  if (envAdmin && clean === envAdmin) return true;

  try {
    const deploymentPath = path.resolve(__dirname, '../src/contracts/deployment.json');
    if (fs.existsSync(deploymentPath)) {
      const data = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      const deployers = [
        data.testnet?.deployerAddress,
        data.mainnet?.deployerAddress,
        data.deployerAddress,
      ].filter(Boolean).map(a => a.toLowerCase());
      if (deployers.includes(clean)) return true;
    }
  } catch {}
  return false;
}

/**
 * Resolves the on-chain registrant for a document from the smart contract, if deployed and registered.
 */
export async function resolveOnChainDocumentRegistrant(docId, customContractAddress, networkName) {
  try {
    const deploymentPath = path.resolve(__dirname, '../src/contracts/deployment.json');
    if (!fs.existsSync(deploymentPath)) return null;
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const isMainnet = /main/i.test(networkName || '');
    const netConfig = isMainnet ? deployment.mainnet : deployment.testnet;
    if (!netConfig || !netConfig.rpcUrl) return null;

    const contractAddr = customContractAddress || netConfig.contractAddress;
    if (!contractAddr || !/^0x[0-9a-fA-F]{40}$/.test(contractAddr)) return null;

    const abiPath = path.resolve(__dirname, '../src/contracts/NotaryVaultRegistry.json');
    if (!fs.existsSync(abiPath)) return null;
    const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8')).abi;

    const provider = new JsonRpcProvider(netConfig.rpcUrl);
    const contract = new Contract(contractAddr, abi, provider);
    const docData = await contract.getDocument(docId);
    if (docData && docData[1] && /^0x[0-9a-fA-F]{40}$/.test(docData[1])) {
      return docData[1].toLowerCase();
    }
  } catch {}
  return null;
}

/**
 * Evaluates whether a caller wallet is authorized to share, access, or manage a document.
 * 
 * Rules:
 * 1. Super Author: can manage/share any document (matches getSuperAuthorAddress(), CONTRACT_ADMIN_ADDRESS, deployer).
 * 2. Document Owner: callerWallet matches record.owner_wallet (0x address).
 * 3. Document Registrant (Secondary Author who registered this doc): callerWallet matches record.registrant_address (0x address).
 * 4. On-chain fallback: If record.owner_wallet is not set or not 0x, check the on-chain contract for this document. If on-chain registrant === callerWallet, caller is authorized.
 * 
 * Returns { authorized: boolean, reason?: string, role?: string }
 */
export async function checkDocumentSharingAuthorization(record, callerWallet, db) {
  const caller = (callerWallet || '').trim().toLowerCase();
  if (!caller || !/^0x[0-9a-fA-F]{40}$/.test(caller)) {
    return { authorized: false, reason: 'Invalid or missing caller wallet address.' };
  }

  // 1. Super Author check
  if (isSuperAuthorAddress(caller)) {
    return { authorized: true, role: 'super_author' };
  }

  // 2. Direct document owner_wallet match (if valid 0x address)
  if (record.owner_wallet && /^0x[0-9a-fA-F]{40}$/i.test(record.owner_wallet.trim())) {
    if (record.owner_wallet.trim().toLowerCase() === caller) {
      return { authorized: true, role: 'owner' };
    }
  }

  // 3. Document registrant_address match (Secondary Author who registered this doc)
  if (record.registrant_address && /^0x[0-9a-fA-F]{40}$/i.test(record.registrant_address.trim())) {
    if (record.registrant_address.trim().toLowerCase() === caller) {
      return { authorized: true, role: 'registrant' };
    }
  }

  // 4. On-Chain Verification Fallback: Check smart contract registry for this document
  try {
    const onChainRegistrant = await resolveOnChainDocumentRegistrant(record.document_id, record.contract_address, record.network_name);
    if (onChainRegistrant) {
      const cleanRegistrant = onChainRegistrant.trim().toLowerCase();
      // If matches caller, they are the verified on-chain registrant!
      if (cleanRegistrant === caller) {
        // Backfill local database to avoid repeated RPC calls
        try {
          if (db) {
            db.prepare('UPDATE documents SET registrant_address = ?, owner_wallet = COALESCE(owner_wallet, ?) WHERE document_id = ?')
              .run(cleanRegistrant, cleanRegistrant, record.document_id);
          }
        } catch {}
        return { authorized: true, role: 'registrant' };
      }
    }
  } catch {}

  // If caller is neither owner, registrant, nor Super Author
  const knownOwner = (record.owner_wallet && record.owner_wallet.startsWith('0x'))
    ? record.owner_wallet
    : (record.registrant_address && record.registrant_address.startsWith('0x'))
    ? record.registrant_address
    : (record.issuer || 'the registered document owner');

  return {
    authorized: false,
    reason: `Access Denied: Only the registered owner or Super Author can share this document. Registered owner: ${knownOwner}. Connected wallet (${caller}) is not authorized.`,
  };
}

/**
 * Extracts authenticated wallet address from request headers or auth tokens.
 */
export function getAuthenticatedWallet(req) {
  if (!req || !req.headers) return null;
  const headerWallet = req.headers['x-wallet-address'] ||
    req.headers['x-authenticated-wallet'] ||
    req.headers['x-author-address'] ||
    req.headers['x-caller-address'] ||
    req.headers['x-owner-wallet'];
  if (headerWallet && typeof headerWallet === 'string' && headerWallet.trim()) {
    const clean = headerWallet.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(clean)) {
      return clean.toLowerCase();
    }
  }
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const candidate = authHeader.slice(7).trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(candidate)) {
      return candidate.toLowerCase();
    }
  }
  return null;
}

/**
 * Initializes SQLite storage database and tables.
 */
export function initStorageDatabase(dbFilePath) {
  const dbDir = path.dirname(dbFilePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(dbFilePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  // 1. Documents catalog table
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      document_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256_hash TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      stored_at TEXT NOT NULL,
      page_count INTEGER,
      mime_type TEXT NOT NULL,
      owner_wallet TEXT,
      owner_email TEXT,
      owner_mobile TEXT,
      notification_consent INTEGER DEFAULT 0,
      email_status TEXT DEFAULT 'unconfigured',
      email_error TEXT,
      sms_status TEXT DEFAULT 'unconfigured',
      sms_error TEXT,
      tx_hash TEXT,
      block_number INTEGER,
      network_name TEXT,
      chain_id INTEGER,
      contract_address TEXT,
      title TEXT,
      category TEXT,
      issuer TEXT,
      registration_status TEXT DEFAULT 'pending'
    );
  `);

  // Migrate existing tables if columns missing
  try {
    const tableInfo = db.prepare("PRAGMA table_info(documents)").all();
    const cols = new Set(tableInfo.map((c) => c.name));
    if (!cols.has('owner_wallet')) db.exec("ALTER TABLE documents ADD COLUMN owner_wallet TEXT;");
    if (!cols.has('registrant_address')) db.exec("ALTER TABLE documents ADD COLUMN registrant_address TEXT;");
    if (!cols.has('owner_email')) db.exec("ALTER TABLE documents ADD COLUMN owner_email TEXT;");
    if (!cols.has('owner_mobile')) db.exec("ALTER TABLE documents ADD COLUMN owner_mobile TEXT;");
    if (!cols.has('notification_consent')) db.exec("ALTER TABLE documents ADD COLUMN notification_consent INTEGER DEFAULT 0;");
    if (!cols.has('email_status')) db.exec("ALTER TABLE documents ADD COLUMN email_status TEXT DEFAULT 'unconfigured';");
    if (!cols.has('email_error')) db.exec("ALTER TABLE documents ADD COLUMN email_error TEXT;");
    if (!cols.has('sms_status')) db.exec("ALTER TABLE documents ADD COLUMN sms_status TEXT DEFAULT 'unconfigured';");
    if (!cols.has('sms_error')) db.exec("ALTER TABLE documents ADD COLUMN sms_error TEXT;");
    if (!cols.has('tx_hash')) db.exec("ALTER TABLE documents ADD COLUMN tx_hash TEXT;");
    if (!cols.has('block_number')) db.exec("ALTER TABLE documents ADD COLUMN block_number INTEGER;");
    if (!cols.has('network_name')) db.exec("ALTER TABLE documents ADD COLUMN network_name TEXT;");
    if (!cols.has('chain_id')) db.exec("ALTER TABLE documents ADD COLUMN chain_id INTEGER;");
    if (!cols.has('contract_address')) db.exec("ALTER TABLE documents ADD COLUMN contract_address TEXT;");
    if (!cols.has('title')) db.exec("ALTER TABLE documents ADD COLUMN title TEXT;");
    if (!cols.has('category')) db.exec("ALTER TABLE documents ADD COLUMN category TEXT;");
    if (!cols.has('issuer')) db.exec("ALTER TABLE documents ADD COLUMN issuer TEXT;");
    if (!cols.has('registration_status')) db.exec("ALTER TABLE documents ADD COLUMN registration_status TEXT DEFAULT 'pending';");

    // Clean up legacy rows where human-readable name was stored in owner_wallet instead of an Ethereum address
    db.exec(`
      UPDATE documents 
      SET issuer = COALESCE(issuer, owner_wallet),
          owner_wallet = NULL
      WHERE owner_wallet IS NOT NULL 
        AND owner_wallet NOT LIKE '0x%';
    `);
  } catch {}

  // 2. Authentication challenges table (single-use nonces)
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_challenges (
      challenge_id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      challenge_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed INTEGER DEFAULT 0
    );
  `);

  // 3. User authenticated sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  // 4. Private access tokens table (expiring & revocable document access)
  db.exec(`
    CREATE TABLE IF NOT EXISTS private_access_tokens (
      token_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      created_by_wallet TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      is_revoked INTEGER DEFAULT 0,
      purpose TEXT,
      token_hash TEXT,
      recipient_email TEXT,
      recipient_mobile TEXT,
      access_policy TEXT
    );
  `);

  try {
    const patInfo = db.prepare("PRAGMA table_info(private_access_tokens)").all();
    const patCols = new Set(patInfo.map((c) => c.name));
    if (!patCols.has('token_hash')) db.exec("ALTER TABLE private_access_tokens ADD COLUMN token_hash TEXT;");
    if (!patCols.has('recipient_email')) db.exec("ALTER TABLE private_access_tokens ADD COLUMN recipient_email TEXT;");
    if (!patCols.has('recipient_mobile')) db.exec("ALTER TABLE private_access_tokens ADD COLUMN recipient_mobile TEXT;");
    if (!patCols.has('access_policy')) db.exec("ALTER TABLE private_access_tokens ADD COLUMN access_policy TEXT;");
  } catch {}

  // 5. Document shares table (tracking owner-initiated delivery and access)
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_shares (
      share_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      owner_wallet TEXT NOT NULL,
      recipient_email TEXT,
      recipient_mobile TEXT,
      token_id TEXT,
      token_hash TEXT,
      access_policy TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      is_revoked INTEGER DEFAULT 0,
      send_email INTEGER DEFAULT 0,
      email_status TEXT DEFAULT 'skipped',
      email_delivery_id TEXT,
      email_error TEXT,
      send_sms INTEGER DEFAULT 0,
      sms_status TEXT DEFAULT 'skipped',
      sms_delivery_id TEXT,
      sms_error TEXT
    );
  `);

  return db;
}

/**
 * Sets standard Cross-Origin Resource Sharing (CORS) headers.
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Content-Length, X-File-Name, X-SHA256-Hash, X-Page-Count, X-Owner-Wallet, X-Owner-Email, X-Owner-Mobile, X-Notification-Consent, X-Access-Token, X-Tx-Hash, X-Block-Number, Authorization'
  );
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-SHA256-Hash, X-Document-ID');
}

/**
 * Helper to read JSON request body.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

/**
 * Creates and configures the local development PDF storage HTTP server.
 */
export function createServer(options = {}) {
  const baseStorageDir = options.storageDir || path.resolve(__dirname, '../storage');
  const uploadsDir = path.resolve(baseStorageDir, 'uploads');
  const dbFilePath = options.dbPath || path.resolve(baseStorageDir, 'notaryvault.db');

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const db = initStorageDatabase(dbFilePath);

  // Prepared SQLite queries
  const getDocStmt = db.prepare('SELECT * FROM documents WHERE document_id = ?');
  const insertDocStmt = db.prepare(`
    INSERT INTO documents (
      document_id, file_name, file_size_bytes, sha256_hash, stored_path, stored_at, page_count, mime_type,
      owner_wallet, owner_email, owner_mobile, notification_consent, issuer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateDocTxStmt = db.prepare(`
    UPDATE documents SET 
      tx_hash = ?, 
      block_number = ?, 
      email_status = ?, 
      email_error = ?, 
      sms_status = ?, 
      sms_error = ? 
    WHERE document_id = ?
  `);
  const confirmRegistrationStmt = db.prepare(`
    UPDATE documents SET 
      tx_hash = ?, 
      block_number = ?, 
      network_name = ?,
      chain_id = ?,
      contract_address = ?,
      title = COALESCE(?, title),
      category = COALESCE(?, category),
      issuer = COALESCE(?, issuer),
      registration_status = ?,
      registrant_address = COALESCE(?, registrant_address),
      owner_wallet = CASE 
        WHEN ? IS NOT NULL AND (? LIKE '0x%' OR ? LIKE '0X%') THEN ?
        ELSE owner_wallet
      END
    WHERE document_id = ?
  `);
  const deleteDocStmt = db.prepare('DELETE FROM documents WHERE document_id = ?');

  // Auth & Session queries
  const insertChallengeStmt = db.prepare(`
    INSERT INTO auth_challenges (challenge_id, wallet_address, challenge_text, created_at, expires_at, consumed)
    VALUES (?, ?, ?, ?, ?, 0)
  `);
  const getChallengeStmt = db.prepare('SELECT * FROM auth_challenges WHERE challenge_id = ?');
  const consumeChallengeStmt = db.prepare('UPDATE auth_challenges SET consumed = 1 WHERE challenge_id = ?');

  const insertSessionStmt = db.prepare(`
    INSERT INTO sessions (token, wallet_address, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  const getSessionStmt = db.prepare('SELECT * FROM sessions WHERE token = ?');

  // Private Access Token queries
  const insertAccessTokenStmt = db.prepare(`
    INSERT INTO private_access_tokens (
      token_id, document_id, created_by_wallet, created_at, expires_at, is_revoked, purpose,
      token_hash, recipient_email, recipient_mobile, access_policy
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
  `);
  const getAccessTokenStmt = db.prepare('SELECT * FROM private_access_tokens WHERE token_id = ?');
  const getAccessTokenByHashStmt = db.prepare('SELECT * FROM private_access_tokens WHERE token_hash = ?');
  const listAccessTokensStmt = db.prepare('SELECT token_id, document_id, created_by_wallet, created_at, expires_at, is_revoked, purpose, access_policy, recipient_email FROM private_access_tokens WHERE document_id = ? AND is_revoked = 0 ORDER BY created_at DESC');
  const revokeAccessTokenStmt = db.prepare('UPDATE private_access_tokens SET is_revoked = 1 WHERE (token_id = ? OR token_hash = ?) AND document_id = ?');
  const revokeTokenByTokenIdStmt = db.prepare('UPDATE private_access_tokens SET is_revoked = 1 WHERE token_id = ? OR token_hash = ?');

  // Document Shares queries
  const insertShareStmt = db.prepare(`
    INSERT INTO document_shares (
      share_id, document_id, owner_wallet, recipient_email, recipient_mobile,
      token_id, token_hash, access_policy, expires_at, created_at, is_revoked,
      send_email, email_status, email_delivery_id, email_error,
      send_sms, sms_status, sms_delivery_id, sms_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listSharesStmt = db.prepare('SELECT * FROM document_shares WHERE document_id = ? ORDER BY created_at DESC');
  const getShareStmt = db.prepare('SELECT * FROM document_shares WHERE share_id = ? AND document_id = ?');
  const revokeShareStmt = db.prepare('UPDATE document_shares SET is_revoked = 1 WHERE share_id = ? AND document_id = ?');

  /**
   * Helper to resolve authenticated wallet from request headers or session tokens.
   */
  function getAuthenticatedWallet(req) {
    if (!req || !req.headers) return null;

    // 1. Check direct wallet headers
    const headerWallet = req.headers['x-wallet-address'] ||
      req.headers['x-authenticated-wallet'] ||
      req.headers['x-author-address'] ||
      req.headers['x-caller-address'];
    if (headerWallet && typeof headerWallet === 'string' && /^0x[0-9a-fA-F]{40}$/.test(headerWallet.trim())) {
      return headerWallet.trim().toLowerCase();
    }

    // 2. Authorization header: bearer session token OR bearer wallet address
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    if (/^0x[0-9a-fA-F]{40}$/.test(token)) {
      return token.toLowerCase();
    }

    const session = getSessionStmt.get(token);
    if (!session) return null;

    // Check expiration
    if (new Date().toISOString() > session.expires_at) {
      return null;
    }
    return session.wallet_address.toLowerCase();
  }

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // ----------------------------------------------------
    // 1. Health check & Notification Provider Status
    // ----------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        provider: 'local_sqlite_server',
        maxSizeBytes: MAX_PDF_SIZE_BYTES,
        notice: 'Local development storage active. Files are stored on local filesystem outside public web root.',
      }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/notifications/status') {
      const status = getNotificationProviderStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }

    // ----------------------------------------------------
    // 2. Authentication: Challenge & Signature Verification
    // ----------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/auth/challenge') {
      try {
        const body = await readJsonBody(req);
        const rawAddr = body.address;
        if (!rawAddr || typeof rawAddr !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(rawAddr.trim())) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Valid 0x Ethereum wallet address is required.' }));
          return;
        }

        const walletAddress = rawAddr.trim().toLowerCase();
        const nonce = crypto.randomBytes(16).toString('hex');
        const challengeId = crypto.randomBytes(16).toString('hex');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes validity

        const challengeText = [
          'NotaryVault Private Access Authorization Challenge',
          `Wallet: ${walletAddress}`,
          `Nonce: ${nonce}`,
          `Issued At: ${now.toISOString()}`,
          `Expires At: ${expiresAt}`,
          'Purpose: Authenticate to access private document originals.',
        ].join('\n');

        insertChallengeStmt.run(challengeId, walletAddress, challengeText, now.toISOString(), expiresAt);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          challengeId,
          challengeText,
          expiresAt,
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/verify') {
      try {
        const body = await readJsonBody(req);
        const { challengeId, challengeText, signature, address } = body;

        if (!signature || !address || (!challengeId && !challengeText)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing signature, address, or challenge information.' }));
          return;
        }

        const expectedAddr = address.trim().toLowerCase();
        let targetChallengeText = challengeText;

        if (challengeId) {
          const rec = getChallengeStmt.get(challengeId);
          if (!rec) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Authentication challenge not found.' }));
            return;
          }
          if (rec.consumed) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Authentication challenge has already been consumed.' }));
            return;
          }
          if (new Date().toISOString() > rec.expires_at) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Authentication challenge has expired.' }));
            return;
          }
          targetChallengeText = rec.challenge_text;
          consumeChallengeStmt.run(challengeId);
        }

        // Cryptographically recover address from signature
        let recoveredAddress = '';
        try {
          recoveredAddress = verifyMessage(targetChallengeText, signature).toLowerCase();
        } catch (sigErr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Invalid cryptographic signature: ${sigErr.message}` }));
          return;
        }

        if (recoveredAddress !== expectedAddr) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Signature address mismatch. Proof of wallet ownership failed.' }));
          return;
        }

        // Issue 24-hour cryptographically random session token
        const token = crypto.randomBytes(32).toString('hex');
        const now = new Date();
        const sessionExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

        insertSessionStmt.run(token, expectedAddr, now.toISOString(), sessionExpiresAt);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          token,
          walletAddress: expectedAddr,
          expiresAt: sessionExpiresAt,
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const wallet = getAuthenticatedWallet(req);
      if (!wallet) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authenticated: false, error: 'No active session or session expired.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: true, walletAddress: wallet }));
      return;
    }

    // ----------------------------------------------------
    // 3. Upload Document PDF: POST /api/documents/:documentId/upload
    // ----------------------------------------------------
    const uploadMatch = pathname.match(/^\/api\/documents\/([^/]+)\/upload$/);
    if (req.method === 'POST' && uploadMatch) {
      const rawId = decodeURIComponent(uploadMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;

      // Check Content-Length upfront
      const contentLengthHeader = req.headers['content-length'];
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_PDF_SIZE_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: `Payload Too Large: File exceeds maximum allowed size of 50 MB (${MAX_PDF_SIZE_BYTES} bytes).`,
        }));
        return;
      }

      const existing = getDocStmt.get(documentId);

      const chunks = [];
      let totalReceived = 0;
      let limitExceeded = false;

      req.on('data', (chunk) => {
        totalReceived += chunk.length;
        if (totalReceived > MAX_PDF_SIZE_BYTES) {
          limitExceeded = true;
          req.pause();
        } else {
          chunks.push(chunk);
        }
      });

      req.on('end', async () => {
        if (limitExceeded) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: `Payload Too Large: File exceeds maximum allowed size of 50 MB (${MAX_PDF_SIZE_BYTES} bytes).`,
          }));
          return;
        }

        const bodyBuffer = Buffer.concat(chunks);

        // Validation: Empty file rejection
        if (bodyBuffer.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Empty file (0 bytes) is not allowed.' }));
          return;
        }

        // Validation: Genuine PDF magic bytes signature check
        if (bodyBuffer.length < 5 || !bodyBuffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Invalid file signature: Only genuine PDF documents starting with %PDF- are accepted.',
          }));
          return;
        }

        // Calculate SHA-256 hash of uploaded bytes
        const computedRaw = crypto.createHash('sha256').update(bodyBuffer).digest('hex').toLowerCase();
        const computedHash = '0x' + computedRaw;

        // Optional check against client claimed hash (supports with or without 0x prefix)
        const clientClaimedHash = req.headers['x-sha256-hash'];
        if (clientClaimedHash && typeof clientClaimedHash === 'string') {
          const rawClient = clientClaimedHash.trim().toLowerCase().replace(/^0x/, '');
          if (rawClient !== computedRaw) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: `SHA-256 checksum mismatch: computed ${computedHash} does not match header ${clientClaimedHash}.`,
            }));
            return;
          }
        }

        // Check overwrite protection
        if (existing) {
          const existingRaw = existing.sha256_hash.trim().toLowerCase().replace(/^0x/, '');
          if (existingRaw === computedRaw) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: `Document "${documentId}" already stored with matching SHA-256 hash.`,
              documentId,
              fileName: existing.file_name,
              fileSizeBytes: existing.file_size_bytes,
              sha256Hash: existing.sha256_hash,
              storedAt: existing.stored_at,
            }));
            return;
          } else {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: `Conflict: Document ID "${documentId}" is already registered with a different original file. Overwriting registered originals is strictly prohibited.`,
            }));
            return;
          }
        }

        const clientFileNameHeader = req.headers['x-file-name'];
        let clientFileName = `${documentId}.pdf`;
        if (clientFileNameHeader && typeof clientFileNameHeader === 'string') {
          const sanitized = path.basename(decodeURIComponent(clientFileNameHeader)).replace(/[^a-zA-Z0-9._-]/g, '_');
          if (sanitized && sanitized.toLowerCase().endsWith('.pdf')) {
            clientFileName = sanitized;
          }
        }

        const safeStorageFileName = `${documentId}.pdf`;
        const targetPath = path.resolve(uploadsDir, safeStorageFileName);

        if (!targetPath.startsWith(uploadsDir)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Path traversal prevented.' }));
          return;
        }

        try {
          fs.writeFileSync(targetPath, bodyBuffer);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Failed to write file to disk: ${err.message}` }));
          return;
        }

        const pageCountHeader = req.headers['x-page-count'];
        const pageCount = pageCountHeader ? parseInt(pageCountHeader, 10) : null;
        const nowIso = new Date().toISOString();

        // Owner contact and identity information
        const rawOwnerWallet = req.headers['x-owner-wallet'] ? decodeURIComponent(String(req.headers['x-owner-wallet'])).trim() : null;
        const callerWallet = getAuthenticatedWallet(req);
        // Store valid 0x address in owner_wallet. If rawOwnerWallet is a human name, preserve it in issuer.
        const ownerWallet = (rawOwnerWallet && /^0x[0-9a-fA-F]{40}$/.test(rawOwnerWallet)) 
          ? rawOwnerWallet.toLowerCase() 
          : (callerWallet || null);
        const ownerName = req.headers['x-owner-name'] 
          ? decodeURIComponent(String(req.headers['x-owner-name'])).trim() 
          : (rawOwnerWallet && !rawOwnerWallet.startsWith('0x') ? rawOwnerWallet : null);
        const ownerEmail = req.headers['x-owner-email'] ? decodeURIComponent(String(req.headers['x-owner-email'])).trim() : null;
        const ownerMobile = req.headers['x-owner-mobile'] ? decodeURIComponent(String(req.headers['x-owner-mobile'])).trim() : null;
        const notificationConsent = req.headers['x-notification-consent'] === 'true' ? 1 : 0;

        try {
          insertDocStmt.run(
            documentId,
            clientFileName,
            bodyBuffer.length,
            computedHash.toLowerCase(),
            safeStorageFileName,
            nowIso,
            isNaN(pageCount) ? null : pageCount,
            'application/pdf',
            ownerWallet,
            ownerEmail,
            ownerMobile,
            notificationConsent,
            ownerName || null
          );
        } catch (dbErr) {
          try { fs.unlinkSync(targetPath); } catch {}
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Failed to insert record into SQLite: ${dbErr.message}` }));
          return;
        }

        // Post-write durability and hash verification before sending success
        if (!fs.existsSync(targetPath)) {
          try { deleteDocStmt.run(documentId); } catch {}
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Storage verification failed: Written PDF file not found on disk.' }));
          return;
        }

        try {
          const writtenBytes = fs.readFileSync(targetPath);
          const verifyRaw = crypto.createHash('sha256').update(writtenBytes).digest('hex').toLowerCase();
          if (verifyRaw !== computedRaw) {
            try { fs.unlinkSync(targetPath); } catch {}
            try { deleteDocStmt.run(documentId); } catch {}
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Storage verification failed: Disk file SHA-256 does not match original bytes.' }));
            return;
          }
        } catch (readErr) {
          try { fs.unlinkSync(targetPath); } catch {}
          try { deleteDocStmt.run(documentId); } catch {}
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Storage verification failed: Could not read back stored file: ${readErr.message}` }));
          return;
        }

        const writtenRecord = getDocStmt.get(documentId);
        if (!writtenRecord) {
          try { fs.unlinkSync(targetPath); } catch {}
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Storage verification failed: SQLite record commit could not be verified.' }));
          return;
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          documentId,
          fileName: clientFileName,
          fileSizeBytes: bodyBuffer.length,
          sha256Hash: computedHash.toLowerCase(),
          storedAt: nowIso,
          verified: true,
        }));
      });

      req.on('error', (err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Upload stream failed: ${err.message}` }));
      });
      return;
    }

    // ----------------------------------------------------
    // 3b. Verify Stored PDF on Disk & SQLite: GET /api/documents/:documentId/verify-storage
    // ----------------------------------------------------
    const verifyStorageMatch = pathname.match(/^\/api\/documents\/([^/]+)\/verify-storage$/);
    if (req.method === 'GET' && verifyStorageMatch) {
      const rawId = decodeURIComponent(verifyStorageMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ verified: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;
      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ verified: false, error: `Document ID "${documentId}" is not registered in storage database.` }));
        return;
      }

      const filePath = path.resolve(uploadsDir, record.stored_path);
      if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ verified: false, error: `Original PDF file is missing from disk storage.` }));
        return;
      }

      const fileBytes = fs.readFileSync(filePath);
      const computedRaw = crypto.createHash('sha256').update(fileBytes).digest('hex').toLowerCase();
      const recordRaw = record.sha256_hash.trim().toLowerCase().replace(/^0x/, '');
      if (computedRaw !== recordRaw) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          verified: false,
          error: `Storage integrity verification failed: Stored file SHA-256 does not match recorded baseline.`,
          expectedHash: record.sha256_hash,
          computedHash: '0x' + computedRaw,
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        verified: true,
        documentId: record.document_id,
        fileName: record.file_name,
        fileSizeBytes: record.file_size_bytes,
        sha256Hash: record.sha256_hash,
        storedAt: record.stored_at,
        registrationStatus: record.registration_status || (record.tx_hash ? 'confirmed' : 'pending'),
        storageProvider: 'local_sqlite_server',
        diskHashVerified: true,
      }));
      return;
    }

    // ----------------------------------------------------
    // 3c. Confirm Registration Post-Blockchain: POST /api/documents/:documentId/confirm-registration
    // ----------------------------------------------------
    const confirmMatch = pathname.match(/^\/api\/documents\/([^/]+)\/confirm-registration$/);
    if (req.method === 'POST' && confirmMatch) {
      const rawId = decodeURIComponent(confirmMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;
      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Document ID "${documentId}" not found in storage.` }));
        return;
      }

      try {
        const body = await readJsonBody(req);
        const { txHash, blockNumber, networkName, chainId, contractAddress, title, category, issuer, status, registrantAddress, ownerWallet } = body;
        if (!txHash || typeof txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Valid 64-hex confirmed transaction hash (0x...) is required.' }));
          return;
        }

        const confirmedWallet = (registrantAddress || ownerWallet || req.headers['x-wallet-address'] || req.headers['x-authenticated-wallet'] || '').trim().toLowerCase();
        const validWallet = /^0x[0-9a-fA-F]{40}$/.test(confirmedWallet) ? confirmedWallet : null;

        const registrationStatus = status || 'confirmed';
        confirmRegistrationStmt.run(
          txHash.trim(),
          blockNumber ? Number(blockNumber) : null,
          networkName || null,
          chainId ? Number(chainId) : null,
          contractAddress ? contractAddress.trim() : null,
          title || null,
          category || null,
          issuer || null,
          registrationStatus,
          validWallet,
          validWallet,
          validWallet,
          validWallet,
          validWallet,
          documentId
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          documentId,
          txHash: txHash.trim(),
          blockNumber: blockNumber ? Number(blockNumber) : null,
          networkName: networkName || null,
          chainId: chainId ? Number(chainId) : null,
          contractAddress: contractAddress || null,
          registrantAddress: validWallet,
          ownerWallet: validWallet,
          registrationStatus,
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // ----------------------------------------------------
    // 4. Public Document Metadata: GET /api/documents/:documentId
    // (Never returns owner email, phone, or raw PDF bytes)
    // ----------------------------------------------------
    const metaMatch = pathname.match(/^\/api\/documents\/([^/]+)$/);
    if (req.method === 'GET' && metaMatch) {
      const rawId = decodeURIComponent(metaMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exists: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;

      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exists: false, error: `Document ID "${documentId}" not found in storage.` }));
        return;
      }

      const filePath = path.resolve(uploadsDir, record.stored_path);
      const fileExistsOnDisk = filePath.startsWith(uploadsDir) && fs.existsSync(filePath);

      // Public projection: STRICTLY EXCLUDES owner_email, owner_mobile, and storage paths
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        exists: true,
        documentId: record.document_id,
        fileName: record.file_name,
        fileSizeBytes: record.file_size_bytes,
        sha256Hash: record.sha256_hash,
        storedAt: record.stored_at,
        pageCount: record.page_count,
        registrantAddress: record.owner_wallet || null,
        storageStatus: fileExistsOnDisk ? 'verified' : 'missing',
        registrationStatus: record.registration_status || (record.tx_hash ? 'confirmed' : 'pending'),
        networkName: record.network_name || null,
        chainId: record.chain_id || null,
        contractAddress: record.contract_address || null,
        txHash: record.tx_hash || null,
        blockNumber: record.block_number || null,
        isPrivateProtected: true,
      }));
      return;
    }

    // ----------------------------------------------------
    // 5. Private Access Tokens Management (Owner Only)
    // ----------------------------------------------------
    const accessTokensMatch = pathname.match(/^\/api\/documents\/([^/]+)\/access-tokens$/);
    if (accessTokensMatch) {
      const rawId = decodeURIComponent(accessTokensMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;

      const callerWallet = getAuthenticatedWallet(req);
      if (!callerWallet) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Authentication required. Connect and sign with your wallet.' }));
        return;
      }

      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Document ID "${documentId}" not found.` }));
        return;
      }

      const auth = await checkDocumentSharingAuthorization(record, callerWallet, db);
      const isOwnerOrAdmin = auth.authorized;
      if (!isOwnerOrAdmin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: auth.reason }));
        return;
      }

      // Create new access token
      if (req.method === 'POST') {
        const body = await readJsonBody(req).catch(() => ({}));
        const purpose = body.purpose ? String(body.purpose).slice(0, 100) : 'Confidential Access';
        const isNoExpiry = body.expiresInHours === 0 || body.expiresInHours === null || body.expiryOption === 'no_fixed_expiry' || body.expiryPolicy === 'never';
        const expiresInHours = !isNoExpiry && typeof body.expiresInHours === 'number' ? body.expiresInHours : (isNoExpiry ? null : 24);

        const tokenId = 'pat_' + crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(tokenId).digest('hex');
        const now = new Date();
        const expiresAt = expiresInHours !== null && expiresInHours !== undefined
          ? new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString()
          : null;

        const accessPolicy = isNoExpiry ? 'no_fixed_expiry' : `${expiresInHours || 24}h`;

        insertAccessTokenStmt.run(
          tokenId, 
          documentId, 
          callerWallet, 
          now.toISOString(), 
          expiresAt, 
          purpose,
          tokenHash,
          body.recipientEmail ? String(body.recipientEmail).trim() : null,
          body.recipientMobile ? String(body.recipientMobile).trim() : null,
          accessPolicy
        );

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          tokenId,
          accessToken: tokenId,
          tokenHash,
          documentId,
          expiresAt,
          accessPolicy,
          purpose,
        }));
        return;
      }

      // List active access tokens
      if (req.method === 'GET') {
        const tokens = listAccessTokensStmt.all(documentId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tokens }));
        return;
      }
    }

    // Revoke access token: DELETE /api/documents/:documentId/access-tokens/:tokenId
    const revokeMatch = pathname.match(/^\/api\/documents\/([^/]+)\/access-tokens\/([^/]+)$/);
    if (req.method === 'DELETE' && revokeMatch) {
      const documentId = decodeURIComponent(revokeMatch[1]).trim().toUpperCase();
      const tokenId = decodeURIComponent(revokeMatch[2]).trim();

      const callerWallet = getAuthenticatedWallet(req);
      if (!callerWallet) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Authentication required.' }));
        return;
      }

      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Document ID "${documentId}" not found.` }));
        return;
      }

      const auth = await checkDocumentSharingAuthorization(record, callerWallet, db);
      if (!auth.authorized) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: auth.reason }));
        return;
      }

      const tokenHash = crypto.createHash('sha256').update(tokenId).digest('hex');
      revokeAccessTokenStmt.run(tokenId, tokenHash, documentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Access token has been revoked successfully.' }));
      return;
    }

    // ----------------------------------------------------
    // 5b. Document Sharing & Multi-Channel Delivery (Owner Only)
    // POST /api/documents/:documentId/share
    // GET /api/documents/:documentId/shares
    // DELETE /api/documents/:documentId/shares/:shareId
    // ----------------------------------------------------
    const shareMatch = pathname.match(/^\/api\/documents\/([^/]+)\/share$/);
    if (req.method === 'POST' && shareMatch) {
      const rawId = decodeURIComponent(shareMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;

      const callerWallet = getAuthenticatedWallet(req);
      if (!callerWallet) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Authentication required. Connect and sign with your wallet.' }));
        return;
      }

      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Document ID "${documentId}" not found in storage.` }));
        return;
      }

      const auth = await checkDocumentSharingAuthorization(record, callerWallet, db);
      const isOwnerOrAdminShare = auth.authorized;
      if (!isOwnerOrAdminShare) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: auth.reason }));
        return;
      }

      const body = await readJsonBody(req).catch(() => ({}));
      const recipientEmail = (body.recipientEmail || '').trim();
      const recipientMobile = (body.recipientMobile || '').trim();
      const sendEmail = Boolean(body.sendEmail);
      const sendSms = Boolean(body.sendSms);
      const purpose = body.purpose ? String(body.purpose).slice(0, 100) : 'Document Share';
      const expiryPolicy = body.expiryPolicy || body.expiryOption || '24h';

      // 1. Validation of contact details
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^\+[1-9]\d{6,14}$/;

      if (sendEmail) {
        if (!recipientEmail || !emailRegex.test(recipientEmail)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Valid recipient email address is required for email delivery: "${recipientEmail}".` }));
          return;
        }
      }

      if (sendSms) {
        if (!recipientMobile || !phoneRegex.test(recipientMobile)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Valid recipient mobile number with international country code (E.164, e.g. +14155552671) is required for SMS: "${recipientMobile}".` }));
          return;
        }
      }

      // 2. Strict PDF Retrieval & SHA-256 Recomputation vs Registered Hash
      const filePath = path.resolve(uploadsDir, record.stored_path);
      if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Original PDF file is missing from local server storage directory.' }));
        return;
      }

      const pdfBytes = fs.readFileSync(filePath);
      const computedRaw = crypto.createHash('sha256').update(pdfBytes).digest('hex').toLowerCase();
      const recordedRaw = normalizeSha256Hex(record.sha256_hash);

      if (computedRaw !== recordedRaw) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          isTampered: true,
          tamperWarning: true,
          error: 'Document integrity check failed: PDF file SHA-256 does not match registered on-chain fingerprint. Delivery aborted to prevent distribution of tampered document.',
          expectedHash: '0x' + recordedRaw,
          computedHash: '0x' + computedRaw,
        }));
        return;
      }

      // 3. Expiry Policy Calculation
      let hours = 24;
      let isNoExpiry = false;
      if (expiryPolicy === '1h') hours = 1;
      else if (expiryPolicy === '24h') hours = 24;
      else if (expiryPolicy === '7d') hours = 168;
      else if (expiryPolicy === '30d') hours = 720;
      else if (expiryPolicy === '90d') hours = 2160;
      else if (expiryPolicy === 'never' || expiryPolicy === 'no_fixed_expiry' || body.expiresInHours === 0 || body.expiresInHours === null) {
        hours = null;
        isNoExpiry = true;
      } else if (typeof body.expiresInHours === 'number') {
        hours = body.expiresInHours > 0 ? body.expiresInHours : null;
        isNoExpiry = hours === null;
      }

      const tokenId = 'pat_' + crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenId).digest('hex');
      const now = new Date();
      const expiresAt = hours ? new Date(now.getTime() + hours * 3600 * 1000).toISOString() : null;
      const effectivePolicy = isNoExpiry ? 'never' : (expiryPolicy || `${hours}h`);

      insertAccessTokenStmt.run(
        tokenId,
        documentId,
        callerWallet,
        now.toISOString(),
        expiresAt,
        purpose,
        tokenHash,
        recipientEmail || null,
        recipientMobile || null,
        effectivePolicy
      );

      const appBaseUrl = req.headers.origin || `http://${req.headers.host || 'localhost:5173'}`;
      const secureAccessUrl = `${appBaseUrl}/verify/${encodeURIComponent(documentId)}?token=${encodeURIComponent(tokenId)}`;

      // 4. Dispatch Email with PDF attachment if requested
      let emailDelivery = { status: 'skipped' };
      if (sendEmail) {
        emailDelivery = await sendEmailNotification({
          toEmail: recipientEmail,
          documentId,
          title: record.file_name || documentId,
          appBaseUrl,
          secureAccessUrl,
          isShareDelivery: true,
          attachment: {
            filename: record.file_name || `${documentId}.pdf`,
            content: pdfBytes,
          },
        });
      }

      // 5. Mobile / SMS sharing is disabled for this release (Coming Soon)
      // Ensure Twilio or external SMS providers are NEVER invoked
      let smsDelivery = { status: 'skipped' };
      if (sendSms) {
        smsDelivery = {
          status: 'disabled',
          provider: 'disabled',
          error: 'Mobile / SMS sharing is disabled for this release (Coming Soon). Twilio API calls are not permitted.',
        };
      }

      // 6. Record Share in document_shares table
      const shareId = 'shr_' + crypto.randomBytes(16).toString('hex');
      insertShareStmt.run(
        shareId,
        documentId,
        callerWallet,
        recipientEmail || null,
        recipientMobile || null,
        tokenId,
        tokenHash,
        effectivePolicy,
        expiresAt,
        now.toISOString(),
        sendEmail ? 1 : 0,
        emailDelivery.status,
        emailDelivery.deliveryId || null,
        emailDelivery.error || null,
        sendSms ? 1 : 0,
        smsDelivery.status,
        smsDelivery.deliveryId || null,
        smsDelivery.error || null
      );

      const sharePayload = {
        shareId,
        documentId,
        accessToken: tokenId,
        secureAccessUrl,
        accessPolicy: effectivePolicy,
        expiresAt,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        shareId,
        documentId,
        accessToken: tokenId,
        secureAccessUrl,
        accessPolicy: effectivePolicy,
        expiresAt,
        share: sharePayload,
        emailDelivery: {
          status: emailDelivery.status,
          provider: emailDelivery.provider || null,
          deliveryId: emailDelivery.deliveryId || null,
          error: emailDelivery.error || null,
          details: emailDelivery.details || null,
        },
        smsDelivery: {
          status: smsDelivery.status,
          provider: smsDelivery.provider || null,
          deliveryId: smsDelivery.deliveryId || null,
          error: smsDelivery.error || null,
          details: smsDelivery.details || null,
        },
      }));
      return;
    }

    // List shares: GET /api/documents/:documentId/shares
    const sharesListMatch = pathname.match(/^\/api\/documents\/([^/]+)\/shares$/);
    if (req.method === 'GET' && sharesListMatch) {
      const rawId = decodeURIComponent(sharesListMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;

      const callerWallet = getAuthenticatedWallet(req);
      if (!callerWallet) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Authentication required.' }));
        return;
      }

      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Document ID "${documentId}" not found in storage.` }));
        return;
      }

      const auth = await checkDocumentSharingAuthorization(record, callerWallet, db);
      if (!auth.authorized) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: auth.reason }));
        return;
      }

      const shares = listSharesStmt.all(documentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, shares }));
      return;
    }

    // Revoke share: DELETE /api/documents/:documentId/shares/:shareId
    const shareRevokeMatch = pathname.match(/^\/api\/documents\/([^/]+)\/shares\/([^/]+)$/);
    if (req.method === 'DELETE' && shareRevokeMatch) {
      const documentId = decodeURIComponent(shareRevokeMatch[1]).trim().toUpperCase();
      const shareId = decodeURIComponent(shareRevokeMatch[2]).trim();

      const callerWallet = getAuthenticatedWallet(req);
      if (!callerWallet) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Authentication required.' }));
        return;
      }

      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Document ID "${documentId}" not found in storage.` }));
        return;
      }

      const auth = await checkDocumentSharingAuthorization(record, callerWallet, db);
      if (!auth.authorized) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: auth.reason }));
        return;
      }

      const share = getShareStmt.get(shareId, documentId);
      if (!share) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Share record not found.' }));
        return;
      }

      revokeShareStmt.run(shareId, documentId);
      if (share.token_id) {
        revokeTokenByTokenIdStmt.run(share.token_id);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Share access and associated token revoked successfully.' }));
      return;
    }

    // ----------------------------------------------------
    // 6. Secure Private PDF Download: GET /api/documents/:documentId/download
    // (Strict server-side authorization: requires valid owner session OR valid access token)
    // ----------------------------------------------------
    const dlMatch = pathname.match(/^\/api\/documents\/([^/]+)\/download$/);
    if (req.method === 'GET' && dlMatch) {
      const rawId = decodeURIComponent(dlMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;

      const record = getDocStmt.get(documentId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: `Original PDF for Document ID "${documentId}" is not stored on this local server.`,
        }));
        return;
      }

      // --- SERVER-SIDE AUTHORIZATION CHECK ---
      let isAuthorized = false;
      let authMethod = '';

      // Method 1: Check authenticated wallet session token
      const callerWallet = getAuthenticatedWallet(req);
      if (callerWallet) {
        if (!record.owner_wallet || record.owner_wallet.toLowerCase() === callerWallet) {
          isAuthorized = true;
          authMethod = 'owner_session';
        } else {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: `Access Denied: Wallet ${callerWallet} is not the authorized owner of Document ID "${documentId}".`,
          }));
          return;
        }
      }

      // Method 2: Check private access token in header or query param (prefer header to avoid bearer tokens in logs/URLs)
      if (!isAuthorized) {
        const tokenCandidate = req.headers['x-access-token'] || parsedUrl.searchParams.get('access_token') || parsedUrl.searchParams.get('token');
        if (tokenCandidate && typeof tokenCandidate === 'string') {
          const cleanToken = tokenCandidate.trim();
          // Cryptographic hash lookup first so server does not need plaintext token storage
          const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
          let tokenRecord = getAccessTokenByHashStmt.get(tokenHash);
          if (!tokenRecord) {
            tokenRecord = getAccessTokenStmt.get(cleanToken);
          }
          if (tokenRecord) {
            if (tokenRecord.document_id !== documentId) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Access Denied: Token does not match this Document ID.' }));
              return;
            }
            if (tokenRecord.is_revoked) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Access Denied: This private access token has been revoked.' }));
              return;
            }
            if (tokenRecord.expires_at !== null && new Date().toISOString() > tokenRecord.expires_at) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Access Denied: This private access token has expired.' }));
              return;
            }
            isAuthorized = true;
            authMethod = 'private_access_token';
          }
        }
      }

      // If neither owner session nor valid access token provided: REJECT
      if (!isAuthorized) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Authentication Required: Original PDF documents are confidential and protected by server-side authorization. Please authenticate with your owner wallet or provide a valid private access token.',
        }));
        return;
      }

      // File retrieval & verification
      const filePath = path.resolve(uploadsDir, record.stored_path);
      if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Document record found, but the file is missing from local storage directory.',
        }));
        return;
      }

      const stat = fs.statSync(filePath);
      const safeDownloadName = encodeURIComponent(record.file_name);

      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${safeDownloadName}"; filename*=UTF-8''${safeDownloadName}`,
        'X-SHA256-Hash': record.sha256_hash,
        'X-Document-ID': record.document_id,
        'X-Auth-Method': authMethod,
      });

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
      return;
    }

    // ----------------------------------------------------
    // 7. Notification Dispatch: POST /api/documents/:documentId/notify
    // (Only executed AFTER confirmed blockchain transaction)
    // ----------------------------------------------------
    const notifyMatch = pathname.match(/^\/api\/documents\/([^/]+)\/notify$/);
    if (req.method === 'POST' && notifyMatch) {
      const rawId = decodeURIComponent(notifyMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;

      try {
        const body = await readJsonBody(req);
        const { 
          txHash, 
          blockNumber, 
          networkName, 
          title, 
          ownerEmail, 
          ownerMobile, 
          notificationConsent,
          category,
          issuer,
          registeredAt,
          sha256Hash,
        } = body;

        // Security check: Must have a valid confirmed transaction hash
        if (!txHash || typeof txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Confirmed blockchain transaction hash (0x + 64 hex characters) is required before sending notifications.',
          }));
          return;
        }

        const record = getDocStmt.get(documentId);
        const effectiveEmail = ownerEmail || record?.owner_email;
        const effectiveMobile = ownerMobile || record?.owner_mobile;
        const effectiveConsent = notificationConsent !== undefined ? Boolean(notificationConsent) : Boolean(record?.notification_consent);

        if (!record) {
          console.warn(`[Notification] Document record not found in storage: ${documentId}`);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            category: 'file_missing',
            error: 'Original PDF is missing: Document has not been uploaded to server storage.',
            notifications: {
              email: {
                status: 'failed',
                category: 'file_missing',
                error: 'Original PDF is missing: Document has not been uploaded to server storage.',
              },
            },
          }));
          return;
        }

        // Retrieve uploaded PDF from storage and verify SHA-256 integrity
        let attachment = null;
        const filePath = path.resolve(uploadsDir, record.stored_path);
        if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
          console.warn(`[Notification] Document file not found on disk: ${filePath}`);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            category: 'file_missing',
            error: 'Original PDF is missing: Stored file was not found in private server storage.',
            notifications: {
              email: {
                status: 'failed',
                category: 'file_missing',
                error: 'Original PDF is missing: Stored file was not found in private server storage.',
              },
            },
          }));
          return;
        }

        const fileBytes = fs.readFileSync(filePath);
        const computedRaw = crypto.createHash('sha256').update(fileBytes).digest('hex').toLowerCase();
        const computedHash = '0x' + computedRaw;
        const targetRaw = normalizeSha256Hex(sha256Hash || record.sha256_hash);

        if (targetRaw && computedRaw !== targetRaw) {
          console.warn(`[Notification:Integrity] Tampered PDF detected for ${documentId}! Computed: 0x${computedRaw}, Expected: 0x${targetRaw}`);
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            category: 'hash_mismatch',
            error: 'PDF hash integrity check failed: Stored file SHA-256 hash does not match registered on-chain hash.',
            notifications: {
              email: {
                status: 'failed',
                category: 'hash_mismatch',
                error: 'PDF hash integrity check failed: Stored file SHA-256 hash does not match registered on-chain hash.',
              },
            },
          }));
          return;
        }

        console.log(`[Notification:Integrity] Verified SHA-256 hash for ${documentId} (${fileBytes.length} bytes).`);
        attachment = {
          filename: record.file_name || `${documentId}.pdf`,
          content: fileBytes,
        };

        let permanentAccessToken = null;
        let permanentAccessUrl = null;

        if (effectiveEmail && effectiveConsent) {
          // Requirement 2: The access link must have NO EXPIRATION DATE (expires_at is null).
          // Requirement 6: Store only a cryptographic hash of the access token on the server.
          // Requirement 8: Send the link only to the owner email explicitly supplied and consented to.
          const secretToken = 'pat_' + crypto.randomBytes(32).toString('hex');
          const tokenHash = crypto.createHash('sha256').update(secretToken).digest('hex');
          const tokenId = 'pat_id_' + crypto.randomBytes(16).toString('hex');
          const nowIso = new Date().toISOString();

          insertAccessTokenStmt.run(
            tokenId,
            documentId,
            record.owner_wallet || 'system_registration',
            nowIso,
            null, // expires_at = null -> Non-expiring permanent token
            'Owner Permanent Access Link',
            tokenHash,
            effectiveEmail.trim(),
            effectiveMobile ? effectiveMobile.trim() : null,
            'permanent'
          );

          permanentAccessToken = secretToken;
          const appBaseUrl = req.headers.origin || `http://${req.headers.host || 'localhost:5173'}`;
          // Requirement 6: Do not put bearer tokens in URL query parameters; use client-side hash fragment #access_token=...
          permanentAccessUrl = `${appBaseUrl}/verify/${encodeURIComponent(documentId)}#access_token=${encodeURIComponent(secretToken)}`;
        }

        const dispatchResult = await dispatchOwnerNotifications({
          documentId,
          title: title || record?.file_name || 'Registered Document',
          category: category,
          issuer: issuer,
          registeredAt: registeredAt || record?.stored_at,
          sha256Hash: sha256Hash || record?.sha256_hash,
          ownerEmail: effectiveEmail,
          ownerMobile: effectiveMobile,
          notificationConsent: effectiveConsent,
          txHash,
          blockNumber,
          networkName,
          attachment,
          appBaseUrl: req.headers.origin || `http://${req.headers.host || 'localhost:5173'}`,
          secureAccessUrl: permanentAccessUrl,
        });

        // Update database with real notification delivery state
        updateDocTxStmt.run(
          txHash,
          blockNumber || null,
          dispatchResult.email.status,
          dispatchResult.email.error || null,
          dispatchResult.sms.status,
          dispatchResult.sms.error || null,
          documentId
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          documentId,
          txHash,
          permanentAccessUrl,
          notifications: dispatchResult,
        }));
      } catch (err) {
        console.error(`[Notification:Error] Unhandled error during notify for ${documentId}:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // ----------------------------------------------------
    // 8. Delete Document (for test cleanup): DELETE /api/documents/:documentId
    // ----------------------------------------------------
    const delMatch = pathname.match(/^\/api\/documents\/([^/]+)$/);
    if (req.method === 'DELETE' && delMatch) {
      const rawId = decodeURIComponent(delMatch[1]);
      const validation = validateCanonicalDocumentId(rawId);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: validation.error }));
        return;
      }
      const documentId = validation.cleanId;

      const record = getDocStmt.get(documentId);
      if (record) {
        const caller = getAuthenticatedWallet(req) || (req.headers['x-wallet-address'] ? req.headers['x-wallet-address'].trim().toLowerCase() : null);
        const superAuthor = getSuperAuthorAddress();
        const isSuper = caller && caller.toLowerCase() === superAuthor.toLowerCase();
        const isOwner = caller && record.owner_wallet && caller.toLowerCase() === record.owner_wallet.toLowerCase();

        if (caller && !isSuper && !isOwner) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Super Author access required: Only the document owner or root Super Author can delete this document.',
          }));
          return;
        }

        const filePath = path.resolve(uploadsDir, record.stored_path);
        if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch {}
        }
        deleteDocStmt.run(documentId);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Document "${documentId}" removed from local storage.` }));
      return;
    }

    // ----------------------------------------------------
    // 8b. Clear Stored Data / Cache: POST /api/admin/clear-storage (Strictly Super Author Only)
    // ----------------------------------------------------
    if ((req.method === 'POST' && pathname === '/api/admin/clear-storage') || (req.method === 'DELETE' && pathname === '/api/storage/clear')) {
      const callerWallet = getAuthenticatedWallet(req) || (req.headers['x-wallet-address'] ? req.headers['x-wallet-address'].trim().toLowerCase() : null);
      const superAuthorAddr = getSuperAuthorAddress();

      if (!callerWallet || callerWallet.toLowerCase() !== superAuthorAddr.toLowerCase()) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Super Author access required: Only the root Super Author can clear stored data.',
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Storage cache cleared by Super Author. On-chain blockchain records remain immutable.',
      }));
      return;
    }

    // ----------------------------------------------------
    // 8c. Save Verified Mainnet Deployment Record: POST /api/deployment/record
    // (Strictly Super Author Only, validates address and txHash, preserves testnet config)
    // ----------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/deployment/record') {
      const callerWallet = getAuthenticatedWallet(req) || (req.headers['x-wallet-address'] ? req.headers['x-wallet-address'].trim().toLowerCase() : null);
      const superAuthorAddr = getSuperAuthorAddress();

      if (!callerWallet || callerWallet.toLowerCase() !== superAuthorAddr.toLowerCase()) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Super Author access required: Only the root Super Author can record contract deployments.',
        }));
        return;
      }

      try {
        const body = await readJsonBody(req);
        const { networkKey, contractAddress, txHash, blockNumber, deployerAddress } = body;

        if (networkKey !== 'mainnet') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Only Mainnet deployment records can be recorded via this endpoint.' }));
          return;
        }

        if (!contractAddress || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Valid 20-byte contract address (0x...) is required.' }));
          return;
        }

        if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Valid 32-byte transaction hash (0x...) is required.' }));
          return;
        }

        const deploymentPath = path.resolve(__dirname, '../src/contracts/deployment.json');
        if (fs.existsSync(deploymentPath)) {
          const raw = fs.readFileSync(deploymentPath, 'utf8');
          const data = JSON.parse(raw);

          // Backup before saving
          const backupPath = path.resolve(__dirname, `../src/contracts/deployment.backup.mainnet.${Date.now()}.json`);
          fs.writeFileSync(backupPath, raw, 'utf8');

          data.mainnet = {
            network: 'MST Chain Mainnet',
            chainId: '0x1226',
            chainIdDecimal: 4646,
            rpcUrl: 'https://mariorpc.mstblockchain.com',
            blockExplorerUrl: 'https://mstscan.com',
            nativeCurrency: { name: 'MSTC', symbol: 'MSTC', decimals: 18 },
            contractAddress: contractAddress.trim(),
            deploymentTxHash: txHash.trim(),
            deployedAtBlock: blockNumber ? Number(blockNumber) : null,
            deployerAddress: deployerAddress || callerWallet,
            deployed: true,
            deployedAt: new Date().toISOString(),
            previousContractAddress: data.mainnet?.contractAddress || '',
            historicalDeployments: data.mainnet?.historicalDeployments || [],
          };

          fs.writeFileSync(deploymentPath, JSON.stringify(data, null, 2), 'utf8');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Mainnet deployment record persistently saved and verified.',
          contractAddress: contractAddress.trim(),
          txHash: txHash.trim(),
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 404 for unknown endpoints
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Not found: ${req.method} ${pathname}` }));
  });

  server.closeStorage = () => {
    try { db.close(); } catch {}
  };

  return server;
}

/**
 * Starts the server on the specified port.
 */
export function startServer(port = DEFAULT_PORT, options = {}) {
  const server = createServer(options);
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(`[NotaryVault Storage Server] Listening on http://localhost:${port}`);
      console.log(`[NotaryVault Storage Server] Max PDF size: ${MAX_PDF_SIZE_BYTES / (1024 * 1024)} MB`);
      console.log(`[NotaryVault Storage Server] Storage mode: Local filesystem + SQLite (Off-chain)`);
      console.log(`[NotaryVault Storage Server] Private Authorization: Enabled (Owner Session / Expiring Access Tokens)`);
      resolve(server);
    });
    server.on('error', (err) => reject(err));
  });
}

// Automatically start when executed directly (node server/index.js)
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('server/index.js') || 
  process.argv[1].endsWith('server\\index.js')
);

if (isDirectExecution) {
  const port = process.env.STORAGE_SERVER_PORT 
    ? parseInt(process.env.STORAGE_SERVER_PORT, 10) 
    : (process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT);
  startServer(port).catch((err) => {
    console.error('[NotaryVault Storage Server] Failed to start:', err);
    process.exit(1);
  });
}
