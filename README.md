# NotaryVault — Decentralized Document Notarization & Verification dApp

NotaryVault is a production-grade decentralized document notarization, integrity verification, and secure distribution platform built on the **MST Chain** (Testnet & Mainnet).

It combines on-chain cryptographic immutability with off-chain private storage and secure notifications, allowing individuals, institutions, and legal entities to anchor document fingerprints onto the blockchain and verify authenticity instantly.

---

## Key Features

- **On-Chain Cryptographic Anchoring**: Documents are hashed client-side using SHA-256. The hash, metadata, registration timestamp, and issuer address are permanently anchored to the `NotaryVaultRegistry` smart contract.
- **Instant Two-Tier Verification**:
  - **Direct File Verification**: Upload any document to calculate its cryptographic digest and verify authenticity, ownership, and revocation status directly against the MST Chain.
  - **Public QR Verification**: Scan dynamic QR codes containing document identifiers and cryptographic proofs to view real-time verification status on mobile or desktop without connecting a wallet.
- **Private Off-Chain Storage**: Full document binary bytes are stored securely in local private server storage (`storage/uploads/`), completely decoupled from the public blockchain to protect sensitive personal and legal data.
- **Secure Transactional Notifications**: Automated delivery of registration confirmation receipts and one-time download links via verified email infrastructure (Resend), attaching the genuine, verified PDF.
- **Document Management & Auditing**: Document revocation, on-chain audit event logging, and access-controlled sharing with cryptographically random tokens and expiry windows.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────┐
                      │          NotaryVault Web App             │
                      │        (React 19, Vite, Ethers v6)       │
                      └─────────────┬────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌─────────────────────────────────┐        ┌───────────────────────────────────┐
│       MST Blockchain            │        │     Private Storage & Delivery    │
│  (Testnet: 91562037 / Mainnet)  │        │       (Node.js / Express)         │
├─────────────────────────────────┤        ├───────────────────────────────────┤
│ • NotaryVaultRegistry.sol       │        │ • SQLite WAL metadata database    │
│ • SHA-256 Digest Indexing       │        │ • Local encrypted file storage    │
│ • Timestamping & Ownership      │        │ • Resend Transactional Email      │
│ • Revocation & Audit Trail      │        │ • Tokenized document sharing      │
└─────────────────────────────────┘        └───────────────────────────────────┘
```

---

## Supported Networks

| Parameter | MST Chain Testnet | MST Chain Mainnet |
|:---|:---|:---|
| **Network Name** | MST Chain Testnet | MST Chain Mainnet |
| **Chain ID (Decimal)** | `91562037` | `4646` |
| **Chain ID (Hex)** | `0x5752035` | `0x1226` |
| **RPC Endpoint** | `https://testnetrpc.mstblockchain.com` | `https://4646.rpc.thirdweb.com` |
| **Block Explorer** | [testnet.mstscan.com](https://testnet.mstscan.com) | [mstscan.com](https://mstscan.com) |
| **Native Token** | MSTC (18 Decimals) | MSTC (18 Decimals) |
| **Registry Address** | `0xC4B7ea1B1cE4e95Bad65bf3fd3c7A079720120F3` | Configurable in `deployment.json` |

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- An EVM-compatible browser wallet (e.g., MetaMask) configured for MST Chain Testnet or Mainnet.

### 2. Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/yashdjadhav08-del/NotaryVault.git
cd NotaryVault
npm install
```

### 3. Environment Configuration
Copy the template configuration file:

```bash
cp .env.example .env
```

Open `.env` in your editor and configure the variables:

```dotenv
# Deployer Private Key (required for contract deployment only; never commit this file)
DEPLOYER_PRIVATE_KEY=

# MST Chain RPC Endpoints
MST_TESTNET_RPC_URL=https://testnetrpc.mstblockchain.com
MST_TESTNET_CHAIN_ID=91562037
MST_MAINNET_RPC_URL=https://4646.rpc.thirdweb.com
MST_MAINNET_CHAIN_ID=4646

# Storage Server Configuration
STORAGE_SERVER_PORT=5001
VITE_STORAGE_SERVER_URL=http://localhost:5001
AUTH_SESSION_SECRET=your_secure_random_session_secret

# Transactional Email Notifications (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=NotaryVault <onboarding@resend.dev>

# Mobile / SMS Notifications (Twilio)
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

> **Security Note**: Never commit `.env` or paste private keys into version control or chat. `.env` is ignored by `.gitignore`.

---

## Development & Build Commands

| Command | Description |
|:---|:---|
| `npm run dev` | Starts Vite dev server (`http://localhost:5173`) with storage server proxy. |
| `npm run server` | Starts local storage and notification backend on port `5001`. |
| `npm run build` | Compiles TypeScript and builds production distribution (`tsc -b && vite build`). |
| `npm run preview` | Previews the production build locally. |
| `npm run compile:contracts` | Compiles `contracts/NotaryVaultRegistry.sol` using `solc`. |
| `npm run test:contracts` | Runs the full 14-suite automated contract, multi-network, and verification test suite. |
| `npm run deploy:mst:testnet` | Deploys `NotaryVaultRegistry` to MST Chain Testnet. |
| `npm run deploy:mst:mainnet` | Deploys `NotaryVaultRegistry` to MST Chain Mainnet. |

---

## Cryptographic Integrity & Security Model

1. **SHA-256 Digest Standardization**:
   - The application computes strict 256-bit cryptographic hashes of original document binary bytes.
   - Hash comparisons normalize hexadecimal casing and optional `0x` prefixes consistently across client memory, server SQLite storage, on-chain bytes32 records, and disk files without mutating raw document bytes.
2. **Private Document Storage**:
   - Full PDF binaries are never committed to git or exposed on public blockchains.
   - Files are stored in private local directory storage (`storage/uploads/`), indexed by unique canonical Document IDs (`NV-YYYY-XXXXXX`).
3. **Non-Custodial Architecture**:
   - User transactions are signed exclusively through the user's connected Web3 wallet.
   - The application never stores user private keys or seed phrases.
4. **Access-Controlled Sharing**:
   - Shared documents generate single-use or time-bound cryptographic access tokens.
   - Unauthenticated or expired requests are strictly rejected.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.
