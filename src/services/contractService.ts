import { ethers } from 'ethers';
import deploymentData from '../contracts/deployment.json';
import contractArtifact from '../contracts/NotaryVaultRegistry.json';
import { hashToBytes32, bytes32ToHash } from '../lib/hash';
import { normalizeDocumentId } from '../lib/id';
import type { DocumentType, DocumentRecord, ActivityEvent, AuthorApplication } from '../types';

export type MSTNetworkKey = 'testnet' | 'mainnet';

export interface MSTNetworkDefinition {
  key: MSTNetworkKey;
  name: string;
  chainIdHex: string;
  chainIdDecimal: number;
  rpcUrl: string;
  explorerBaseUrl: string;
  currency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// Canonical deployment structure with safe fallbacks
export interface MultiNetworkDeploymentConfig {
  testnet: {
    network: string;
    chainId: string;
    chainIdDecimal: number;
    rpcUrl: string;
    blockExplorerUrl: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    contractAddress: string;
    deploymentTxHash: string;
    deployedAtBlock: number | null;
    deployerAddress: string;
    deployed: boolean;
    deployedAt: string | null;
    previousContractAddress?: string;
    historicalDeployments?: Array<{
      version: string;
      contractAddress: string;
      deploymentTxHash: string;
      deployedAtBlock: number | null;
      deployerAddress: string;
      deployedAt: string;
    }>;
  };
  mainnet: {
    network: string;
    chainId: string;
    chainIdDecimal: number;
    rpcUrl: string;
    blockExplorerUrl: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    contractAddress: string;
    deploymentTxHash: string;
    deployedAtBlock: number | null;
    deployerAddress: string;
    deployed: boolean;
    deployedAt: string | null;
    previousContractAddress?: string;
    historicalDeployments?: Array<{
      version: string;
      contractAddress: string;
      deploymentTxHash: string;
      deployedAtBlock: number | null;
      deployerAddress: string;
      deployedAt: string;
    }>;
  };
  [key: string]: any;
}

const deploymentConfig = deploymentData as unknown as MultiNetworkDeploymentConfig;

export const MST_NETWORKS: Record<MSTNetworkKey, MSTNetworkDefinition> = {
  testnet: {
    key: 'testnet',
    name: 'MST Chain Testnet',
    chainIdHex: '0x5752035',
    chainIdDecimal: 91562037,
    rpcUrl: deploymentConfig.testnet?.rpcUrl || 'https://testnetrpc.mstblockchain.com',
    explorerBaseUrl: deploymentConfig.testnet?.blockExplorerUrl || 'https://testnet.mstscan.com',
    currency: {
      name: 'MSTC',
      symbol: 'MSTC',
      decimals: 18,
    },
  },
  mainnet: {
    key: 'mainnet',
    name: 'MST Chain Mainnet',
    chainIdHex: '0x1226', // 4646 in hex is 0x1226
    chainIdDecimal: 4646,
    rpcUrl: deploymentConfig.mainnet?.rpcUrl || 'https://mariorpc.mstblockchain.com',
    explorerBaseUrl: deploymentConfig.mainnet?.blockExplorerUrl || 'https://mstscan.com',
    currency: {
      name: 'MSTC',
      symbol: 'MSTC',
      decimals: 18,
    },
  },
};

// Legacy constants for backward compatibility
export const MST_CHAIN_ID_HEX = MST_NETWORKS.testnet.chainIdHex;
export const MST_CHAIN_ID_DECIMAL = MST_NETWORKS.testnet.chainIdDecimal;
export const MST_RPC_URL = MST_NETWORKS.testnet.rpcUrl;
export const MST_EXPLORER_BASE_URL = MST_NETWORKS.testnet.explorerBaseUrl;

/**
 * Returns the block explorer transaction details URL for the active or specified network.
 * Testnet: https://testnet.mstscan.com/tx/<txHash>
 * Mainnet: https://mstscan.com/tx/<txHash>
 */
export function getExplorerTxUrl(txHash: string, networkKey: MSTNetworkKey = 'testnet'): string {
  const base = MST_NETWORKS[networkKey]?.explorerBaseUrl || MST_NETWORKS.testnet.explorerBaseUrl;
  if (!txHash) return base;
  return `${base}/tx/${txHash.trim()}`;
}

/**
 * Returns the block explorer contract/account address details URL for the active or specified network.
 * Testnet: https://testnet.mstscan.com/address/<address>
 * Mainnet: https://mstscan.com/address/<address>
 */
export function getExplorerAddressUrl(address: string, networkKey: MSTNetworkKey = 'testnet'): string {
  const base = MST_NETWORKS[networkKey]?.explorerBaseUrl || MST_NETWORKS.testnet.explorerBaseUrl;
  if (!address) return base;
  return `${base}/address/${address.trim()}`;
}

// Map human readable document types to smart contract enum indices:
// enum DocumentType { PropertyDeed, SaleAgreement, RentalAgreement, Affidavit, PowerOfAttorney, Other }
export const DOCUMENT_TYPE_MAP: Record<DocumentType, number> = {
  'Property Deed': 0,
  'Sale Agreement': 1,
  'Rental Agreement': 2,
  'Affidavit': 3,
  'Power of Attorney': 4,
};

export const DOCUMENT_TYPE_REVERSE_MAP: Record<number, DocumentType> = {
  0: 'Property Deed',
  1: 'Sale Agreement',
  2: 'Rental Agreement',
  3: 'Affidavit',
  4: 'Power of Attorney',
};

export interface OnChainRegistrationResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  networkChainId?: string;
  registrant?: string;
  networkKey?: MSTNetworkKey;
  error?: string;
}

export interface OnChainVerificationResult {
  checked: boolean;
  isValid: boolean;
  exists: boolean;
  registrant?: string;
  registeredAt?: number;
  isRevoked?: boolean;
  documentHash?: string;
  documentType?: DocumentType | string;
  networkKey?: MSTNetworkKey;
  contractAddress?: string;
  error?: string;
}

export interface OnChainDocumentDetails {
  exists: boolean;
  docId: string;
  documentHash: string;
  registrant: string;
  registeredAt: number;
  documentType: DocumentType | string;
  isRevoked: boolean;
  networkKey?: MSTNetworkKey;
  contractAddress?: string;
  isHistorical?: boolean;
  error?: string;
}

export interface OnChainRevocationResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  networkKey?: MSTNetworkKey;
  chainId?: string | number;
  contractAddress?: string;
  error?: string;
}

const TESTNET_KNOWN_ADDRESSES = [
  '0xc4b7ea1b1ce4e95bad65bf3fd3c7a079720120f3',
  '0xe9097672c2556318f1bd974323174baa43b88514'
];

export function isTestnetContractAddress(addr?: string | null): boolean {
  if (!addr) return false;
  return TESTNET_KNOWN_ADDRESSES.includes(addr.trim().toLowerCase());
}

export interface DocumentIdCheckResult {
  exists: boolean;
  docId: string;
  source?: 'active_contract' | 'historical_contract' | 'unconfigured';
  contractAddress?: string;
  registrant?: string;
  registeredAt?: number;
  isRevoked?: boolean;
  isContractDeployed?: boolean;
  unverifiedOnChain?: boolean;
  error?: string;
}

/**
 * Returns the deployed contract address for a given network, or empty string if not deployed.
 * Strictly guarantees that Testnet contract addresses are never used for Mainnet.
 */
export function getContractAddressForNetwork(networkKey: MSTNetworkKey = 'testnet'): string {
  // 1. Allow runtime / localStorage override (e.g. after in-app deployment)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(`notaryvault_${networkKey}_contract_address`);
      if (stored && ethers.isAddress(stored.trim())) {
        const trimmed = stored.trim();
        // Guard: Never allow Testnet address to be used on Mainnet
        if (networkKey === 'mainnet' && isTestnetContractAddress(trimmed)) {
          console.warn('[NotaryVault:Security] Blocked attempt to use Testnet contract address for Mainnet:', trimmed);
        } else {
          return trimmed;
        }
      }
    } catch {}
  }

  // 2. Allow environment variable override for Mainnet and Testnet
  if (typeof process !== 'undefined' && process.env) {
    if (networkKey === 'mainnet') {
      const envMainnet = process.env.VITE_MAINNET_CONTRACT_ADDRESS || process.env.MAINNET_CONTRACT_ADDRESS;
      if (envMainnet && ethers.isAddress(envMainnet.trim())) {
        const trimmed = envMainnet.trim();
        if (isTestnetContractAddress(trimmed)) {
          console.warn('[NotaryVault:Security] Blocked Testnet address in Mainnet env variable:', trimmed);
        } else {
          return trimmed;
        }
      }
    } else {
      const envTestnet = process.env.VITE_TESTNET_CONTRACT_ADDRESS || process.env.TESTNET_CONTRACT_ADDRESS;
      if (envTestnet && ethers.isAddress(envTestnet.trim())) return envTestnet.trim();
    }
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    if (networkKey === 'mainnet') {
      const envMainnet = (import.meta as any).env.VITE_MAINNET_CONTRACT_ADDRESS;
      if (envMainnet && ethers.isAddress(envMainnet.trim())) {
        const trimmed = envMainnet.trim();
        if (isTestnetContractAddress(trimmed)) {
          console.warn('[NotaryVault:Security] Blocked Testnet address in Mainnet import.meta.env:', trimmed);
        } else {
          return trimmed;
        }
      }
    } else {
      const envTestnet = (import.meta as any).env.VITE_TESTNET_CONTRACT_ADDRESS;
      if (envTestnet && ethers.isAddress(envTestnet.trim())) return envTestnet.trim();
    }
  }

  const networkSection = deploymentConfig[networkKey];
  if (networkSection && networkSection.contractAddress && ethers.isAddress(networkSection.contractAddress)) {
    const trimmed = networkSection.contractAddress.trim();
    if (networkKey === 'mainnet' && isTestnetContractAddress(trimmed)) {
      console.warn('[NotaryVault:Security] Blocked Testnet address in Mainnet section of deploymentConfig:', trimmed);
    } else {
      return trimmed;
    }
  }
  // Fallback to top-level if checking testnet
  if (networkKey === 'testnet' && deploymentConfig.contractAddress && ethers.isAddress(deploymentConfig.contractAddress)) {
    return deploymentConfig.contractAddress.trim();
  }
  return '';
}

export interface ContractCapabilitiesResult {
  valid: boolean;
  hasBytecode: boolean;
  hasAdmin: boolean;
  hasRegisterMethod: boolean;
  hasVerifyMethod: boolean;
  adminAddress?: string;
  contractAddress?: string;
  error?: string;
}

/**
 * Verifies that a deployed smart contract exists on-chain and implements the required
 * NotaryVault registration and authorization interface methods before enabling operations.
 */
export async function verifyContractCapabilities(
  networkKey: MSTNetworkKey = 'mainnet'
): Promise<ContractCapabilitiesResult> {
  const contractAddress = getContractAddressForNetwork(networkKey);
  const targetNet = MST_NETWORKS[networkKey] || MST_NETWORKS.mainnet;

  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    return {
      valid: false,
      hasBytecode: false,
      hasAdmin: false,
      hasRegisterMethod: false,
      hasVerifyMethod: false,
      error: `No contract address configured for ${targetNet.name}.`,
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(targetNet.rpcUrl);
    const code = await provider.getCode(contractAddress);
    if (!code || code === '0x' || code === '0x0') {
      return {
        valid: false,
        hasBytecode: false,
        hasAdmin: false,
        hasRegisterMethod: false,
        hasVerifyMethod: false,
        contractAddress,
        error: `No contract bytecode deployed at address ${contractAddress} on ${targetNet.name}.`,
      };
    }

    const contract = new ethers.Contract(contractAddress, contractArtifact.abi, provider);
    let adminAddress = '';
    let hasAdmin = false;
    try {
      adminAddress = await contract.admin();
      hasAdmin = Boolean(adminAddress && ethers.isAddress(adminAddress));
    } catch {}

    const hasRegisterMethod = typeof contract.registerDocument === 'function';
    const hasVerifyMethod = typeof contract.verifyDocument === 'function';

    const valid = Boolean(hasAdmin && hasRegisterMethod && hasVerifyMethod);

    return {
      valid,
      hasBytecode: true,
      hasAdmin,
      hasRegisterMethod,
      hasVerifyMethod,
      adminAddress: adminAddress || undefined,
      contractAddress,
      error: valid ? undefined : `Contract at ${contractAddress} does not implement the required NotaryVaultRegistry interface.`,
    };
  } catch (err: any) {
    return {
      valid: false,
      hasBytecode: false,
      hasAdmin: false,
      hasRegisterMethod: false,
      hasVerifyMethod: false,
      contractAddress,
      error: `RPC error verifying contract on ${targetNet.name}: ${err?.message || 'Connection failed'}`,
    };
  }
}

/**
 * Returns read-only ethers contract connected via public RPC for the specified network.
 */
export function getReadOnlyContract(networkKey: MSTNetworkKey = 'testnet'): ethers.Contract | null {
  const contractAddress = getContractAddressForNetwork(networkKey);
  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    return null;
  }
  const networkDef = MST_NETWORKS[networkKey] || MST_NETWORKS.testnet;
  const provider = new ethers.JsonRpcProvider(networkDef.rpcUrl);
  return new ethers.Contract(contractAddress, contractArtifact.abi, provider);
}

/**
 * Returns array of historical contract addresses for a given network (e.g. v1 deployment).
 */
export function getHistoricalContractAddresses(networkKey: MSTNetworkKey = 'testnet'): string[] {
  const addresses: string[] = [];
  const networkSection = deploymentConfig[networkKey];
  if (networkSection?.previousContractAddress && ethers.isAddress(networkSection.previousContractAddress)) {
    const addr = networkSection.previousContractAddress.trim();
    if (networkKey !== 'mainnet' || !isTestnetContractAddress(addr)) {
      addresses.push(addr);
    }
  }
  if (Array.isArray(networkSection?.historicalDeployments)) {
    for (const h of networkSection.historicalDeployments) {
      if (h.contractAddress && ethers.isAddress(h.contractAddress)) {
        const addr = h.contractAddress.trim();
        if (networkKey !== 'mainnet' || !isTestnetContractAddress(addr)) {
          if (!addresses.includes(addr)) {
            addresses.push(addr);
          }
        }
      }
    }
  }
  return addresses;
}

/**
 * Returns read-only ethers contract instance pointing to a specific contract address.
 */
export function getReadOnlyContractForAddress(
  contractAddress: string,
  networkKey: MSTNetworkKey = 'testnet'
): ethers.Contract | null {
  if (!contractAddress || !ethers.isAddress(contractAddress)) return null;
  const networkDef = MST_NETWORKS[networkKey] || MST_NETWORKS.testnet;
  const provider = new ethers.JsonRpcProvider(networkDef.rpcUrl);
  return new ethers.Contract(contractAddress, contractArtifact.abi, provider);
}

/**
 * Reads the authorized admin address from the deployed contract's admin() function.
 * Falls back to the verified deployment configuration deployerAddress if offline.
 */
export async function getContractAdmin(networkKey: MSTNetworkKey = 'testnet'): Promise<string> {
  const contract = getReadOnlyContract(networkKey);
  if (contract) {
    try {
      const adminOnChain = await contract.admin();
      if (adminOnChain && ethers.isAddress(adminOnChain)) {
        return adminOnChain;
      }
    } catch {
      // RPC or call fallback
    }
  }
  return deploymentConfig[networkKey]?.deployerAddress || '';
}

/**
 * Validates that an incoming chainId matches the target network.
 * Handles both decimal numbers/strings and hex representations (e.g. 91562037 / 0x5752035 for testnet, 4646 / 0x1226 for mainnet).
 * Chain ID matching is strict and exact.
 */
export function isChainIdMatchingNetwork(chainId: string | number | bigint, networkKey: MSTNetworkKey): boolean {
  const target = MST_NETWORKS[networkKey];
  if (!target) return false;

  let dec: number;
  if (typeof chainId === 'bigint') {
    dec = Number(chainId);
  } else if (typeof chainId === 'number') {
    dec = chainId;
  } else if (typeof chainId === 'string') {
    dec = chainId.startsWith('0x') || chainId.startsWith('0X')
      ? parseInt(chainId, 16)
      : parseInt(chainId, 10);
  } else {
    return false;
  }

  if (isNaN(dec)) return false;

  if (networkKey === 'testnet') {
    return dec === target.chainIdDecimal; // Exactly 91562037 (hex 0x5752035)
  }

  if (networkKey === 'mainnet') {
    return dec === target.chainIdDecimal; // Exactly 4646 (hex 0x1226)
  }

  return false;
}

/**
 * Returns writeable contract attached to the user's browser wallet signer.
 * Strictly verifies the connected wallet network matches the requested networkKey.
 */
export async function getSignerContract(
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{ contract: ethers.Contract; signer: ethers.Signer; chainId: string; contractAddress: string; networkKey: MSTNetworkKey }> {
  if (!rawProvider) {
    throw new Error('No wallet provider detected. Please connect your BridgeKey wallet.');
  }

  const targetNet = MST_NETWORKS[networkKey] || MST_NETWORKS.testnet;
  const browserProvider = new ethers.BrowserProvider(rawProvider);
  const network = await browserProvider.getNetwork();
  const currentChainIdHex = '0x' + network.chainId.toString(16);

  if (!isChainIdMatchingNetwork(network.chainId, networkKey)) {
    throw new Error(
      `Incorrect network (${currentChainIdHex}). Please switch your wallet to ${targetNet.name} (Chain ID: ${targetNet.chainIdDecimal} / ${targetNet.chainIdHex}).`
    );
  }

  const contractAddress = getContractAddressForNetwork(networkKey);
  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    if (networkKey === 'mainnet') {
      throw new Error(
        'MAINNET CONTRACT NOT DEPLOYED/CONFIGURED: Smart contract has not been deployed or configured on MST Chain Mainnet (Chain ID: 4646 / 0x1226). Transactions cannot be sent.'
      );
    }
    throw new Error(
      'Smart contract has not been deployed to MST Chain Testnet yet. Run `npm run deploy:mst` to deploy.'
    );
  }

  const signer = await browserProvider.getSigner();
  const contract = new ethers.Contract(contractAddress, contractArtifact.abi, signer);
  return { contract, signer, chainId: currentChainIdHex, contractAddress, networkKey };
}

/**
 * Deep-searches an error object for any hex-encoded revert data field.
 * Covers the nested shapes produced by ethers v6, BridgeKey wallet, and raw JSON-RPC providers.
 * Returns the first non-empty, non-zero hex string found, or null.
 */
function spelunkAllData(err: any, depth = 0): string | null {
  if (!err || typeof err !== 'object' || depth > 6) return null;

  // Direct data fields — check first
  for (const key of ['data', 'revertData', 'returnData']) {
    const candidate = err[key];
    if (typeof candidate === 'string' && /^0x[0-9a-fA-F]{8,}/.test(candidate)) {
      return candidate;
    }
  }

  // BridgeKey and MetaMask wrap errors under nested objects
  for (const key of ['error', 'info', 'cause', 'inner']) {
    const nested = err[key];
    if (nested && typeof nested === 'object') {
      const found = spelunkAllData(nested, depth + 1);
      if (found) return found;
    }
  }

  // Some providers put the raw JSON-RPC error under info.error
  if (err.info && typeof err.info === 'object') {
    const found = spelunkAllData(err.info, depth + 1);
    if (found) return found;
  }

  return null;
}

/**
 * Safely extracts the message chain from a nested error, without leaking sensitive data.
 */
function spelunkMessage(err: any, depth = 0): string {
  if (!err || depth > 4) return '';
  const msg: string = typeof err.message === 'string' ? err.message : '';
  const nested = err.error || err.cause || err.inner || (err.info && err.info.error);
  const nestedMsg = nested ? spelunkMessage(nested, depth + 1) : '';
  return [msg, nestedMsg].filter(Boolean).join(' | ');
}

/**
 * Maps a decoded contract error name to a user-readable string.
 */
function mapContractErrorName(name: string): string {
  switch (name) {
    case 'EmptyDocumentId': return 'Document ID cannot be empty.';
    case 'ZeroDocumentHash': return 'Document hash cannot be zero.';
    case 'DocumentAlreadyExists': return 'This Document ID is already registered. Please generate or enter a different ID.';
    case 'HashAlreadyRegistered': return 'This file SHA-256 hash has already been registered on MST Chain under another document ID.';
    case 'InvalidDocumentType': return 'Invalid document category specified.';
    case 'DocumentAlreadyRevoked': return 'This document has already been revoked on-chain.';
    case 'UnauthorizedCaller': return 'Unauthorized: Only the original registrant or Super Author can execute this operation.';
    case 'UnauthorizedAuthor': return 'Unauthorized Author: Only the Super Author or an approved Secondary Author can register documents.';
    case 'CannotAuthorizeZeroAddress': return 'Cannot authorize the zero address (0x0).';
    case 'CannotAuthorizeAdmin': return 'The Super Author already possesses root authority and cannot be added as a Secondary Author.';
    case 'AuthorAlreadyAuthorized': return 'This wallet address is already an authorized Secondary Author.';
    case 'AuthorNotAuthorized': return 'This wallet address is not an authorized Secondary Author.';
    case 'EmptyApplicationId': return 'Application ID cannot be empty.';
    case 'ApplicantAlreadyAuthor': return 'This wallet address is already an authorized author on this network.';
    case 'ApplicationAlreadyPending': return 'This wallet already has an active pending author application awaiting Super Author review.';
    case 'ApplicationNotFound': return 'No author application found for this wallet address.';
    case 'ApplicationNotPending': return 'This author application is not in pending status.';
    case 'InvalidNewAdmin': return 'New Super Author address must be different from current administrator.';
    case 'DocumentNotFound': return 'Document was not found in the on-chain registry.';
    default: return `Contract reverted: ${name}`;
  }
}

/**
 * Decodes smart contract custom revert errors and wallet exceptions into user-friendly explanations.
 * Handles ethers v6 UNKNOWN_ERROR ("could not coalesce error"), BridgeKey-specific nested error
 * shapes, user rejection codes, and all ABI-encoded custom revert errors.
 */
export function parseContractError(err: any): string {
  if (!err) return 'Unknown error occurred.';

  // ── User rejection (EIP-1193 code 4001 or ethers ACTION_REJECTED) ──────────
  if (
    err.code === 4001 ||
    err.code === 'ACTION_REJECTED' ||
    (err.info && (err.info.error?.code === 4001 || err.info.code === 4001)) ||
    (err.error && err.error.code === 4001)
  ) {
    return 'Transaction rejected in wallet.';
  }

  // Check nested rejection by message pattern (some wallets don't set code 4001)
  const fullMsg = spelunkMessage(err);
  if (/user (denied|rejected)|rejected (the )?transaction|user cancel/i.test(fullMsg)) {
    return 'Transaction rejected in wallet.';
  }

  // ── Insufficient funds ──────────────────────────────────────────────────────
  if (
    err.code === 'INSUFFICIENT_FUNDS' ||
    /insufficient funds|base fee exceeds gas limit/i.test(fullMsg)
  ) {
    return 'Insufficient MSTC balance to pay for transaction gas.';
  }

  // ── ABI-decode custom contract errors from all possible revert data locations ─
  const iface = new ethers.Interface(contractArtifact.abi);
  const revertData = spelunkAllData(err);
  if (revertData) {
    try {
      const parsed = iface.parseError(revertData);
      if (parsed) {
        return mapContractErrorName(parsed.name);
      }
    } catch {
      // revert data could not be ABI-decoded — fall through
    }
  }

  // ── Ethers v6 UNKNOWN_ERROR ("could not coalesce error") ────────────────────
  // This is produced when the JSON-RPC error payload does not match any known
  // pattern inside ethers' getRpcError(). Try every known nested path for an
  // ABI-encoded revert before giving up.
  if (err.code === 'UNKNOWN_ERROR' || (err.message && err.message.includes('could not coalesce'))) {
    // Already tried spelunkAllData above — return a safe descriptive message
    const body = err.info?.error || err.error;
    const rawCode = body?.code;
    const rawMsg: string = body?.message || body?.data?.message || '';
    if (/user (denied|rejected)/i.test(rawMsg)) {
      return 'Transaction rejected in wallet.';
    }
    if (rawCode === 4001) {
      return 'Transaction rejected in wallet.';
    }
    if (/insufficient funds/i.test(rawMsg)) {
      return 'Insufficient MSTC balance to pay for transaction gas.';
    }
    if (rawMsg) {
      return `Wallet/RPC error: ${rawMsg.slice(0, 200)}`;
    }
    return 'Wallet or RPC error: the provider returned an unrecognised response. Check that BridgeKey is unlocked and connected to MST Chain Testnet.';
  }

  // ── Standard ethers error codes ─────────────────────────────────────────────
  if (err.code === 'CALL_EXCEPTION') {
    if (err.shortMessage && !err.shortMessage.includes('could not coalesce')) {
      return err.shortMessage;
    }
    return 'Contract call reverted — verify your wallet is authorized and the document ID is unique.';
  }

  if (err.code === 'NETWORK_ERROR' || err.code === 'SERVER_ERROR') {
    return 'Network error communicating with MST Chain. Check your internet connection and RPC endpoint.';
  }

  if (err.code === 'TIMEOUT') {
    return 'Request timed out waiting for MST Chain. Please try again.';
  }

  // ── Final fallbacks ──────────────────────────────────────────────────────────
  if (err.shortMessage && !err.shortMessage.includes('could not coalesce')) return err.shortMessage;
  if (err.message && !err.message.includes('could not coalesce')) return err.message;
  return 'Smart contract operation failed. Please check your wallet connection and try again.';
}

/**
 * Register a document on-chain using the connected BridgeKey wallet on the active network.
 *
 * Hardened against ethers v6 "could not coalesce error" by:
 * 1. Pre-flight author check via read-only eth_call — fails fast with a clear message
 *    before gas estimation touches the wallet, so the popup is never suppressed.
 * 2. Comprehensive raw error logging (no sensitive data) for debugging.
 * 3. delegating all error decoding to the hardened parseContractError().
 */
export async function registerOnChain(
  docId: string,
  sha256Hex: string,
  docType: DocumentType,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<OnChainRegistrationResult> {
  try {
    // 1. Canonical normalization of Document ID
    const cleanId = normalizeDocumentId(docId);
    if (!cleanId) {
      return {
        success: false,
        networkKey,
        error: 'Document ID cannot be empty.',
      };
    }

    // 2. Client preflight verification across active and historical registries
    const existingCheck = await checkDocumentIdExists(cleanId, networkKey);
    if (existingCheck.exists) {
      const conflictMsg = existingCheck.source === 'historical_contract'
        ? 'Document ID exists in the historical registry.'
        : 'Document ID already exists on the active registry.';
      return {
        success: false,
        networkKey,
        error: conflictMsg,
      };
    }
    if (existingCheck.error) {
      console.warn(`[registerOnChain] Preflight ID check encountered RPC error for "${cleanId}": ${existingCheck.error}. Proceeding to on-chain transaction for atomic enforcement.`);
    }

    // 3. Validate and convert hash
    const bytes32Hash = hashToBytes32(sha256Hex);
    const typeIndex = DOCUMENT_TYPE_MAP[docType] ?? 0;

    // 4. Obtain signer contract with network check
    const { contract, signer, chainId } = await getSignerContract(rawProvider, networkKey);
    const registrantAddress = await signer.getAddress();

    // 5. Pre-flight author check via read-only call — prevents wallet popup suppression
    //    caused by a reverted gas estimation inside ethers' populateTransaction().
    //    The read-only contract uses the public JSON-RPC endpoint, not the user's wallet.
    const readOnlyContract = getReadOnlyContract(networkKey);
    if (readOnlyContract) {
      try {
        const isAuth: boolean = await readOnlyContract.isAuthor(registrantAddress);
        if (!isAuth) {
          console.warn(`[registerOnChain] Pre-flight author check failed for ${registrantAddress} on ${networkKey}`);
          return {
            success: false,
            networkKey,
            error: 'Unauthorized Author: Only the Super Author or an approved Secondary Author can register documents.',
          };
        }
      } catch (authorCheckErr: any) {
        // isAuthor() might not exist on older contract versions — log and proceed,
        // letting the on-chain transaction enforce authorization atomically.
        console.warn('[registerOnChain] Pre-flight isAuthor() check skipped (contract may not expose it):', authorCheckErr?.message || authorCheckErr);
      }
    }

    // 6. Submit transaction — at this point the wallet WILL show its confirmation popup
    console.info(`[registerOnChain] Sending registerDocument tx for "${cleanId}" on ${networkKey} from ${registrantAddress}`);
    const tx = await contract.registerDocument(cleanId, bytes32Hash, typeIndex);

    // 7. Await mining receipt & verify success status
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction execution failed or was reverted on-chain.');
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      contractAddress: await contract.getAddress(),
      networkChainId: chainId,
      registrant: registrantAddress,
      networkKey,
    };
  } catch (err: any) {
    // Log raw error properties safely (never log private keys, seeds, or PDF bytes)
    console.error('[registerOnChain] Transaction error:', {
      code: err?.code,
      message: err?.message?.slice?.(0, 300),
      shortMessage: err?.shortMessage?.slice?.(0, 200),
      reason: err?.reason?.slice?.(0, 200),
      data: err?.data,
      infoErrorCode: err?.info?.error?.code,
      infoErrorMessage: err?.info?.error?.message?.slice?.(0, 200),
      infoErrorData: err?.info?.error?.data,
      errorData: err?.error?.data,
    });
    return {
      success: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Verifies a document on-chain by Document ID and submitted SHA-256 hash.
 * Uses public read-only JSON-RPC provider (no wallet signature required).
 */
export async function verifyOnChain(
  docId: string,
  submittedSha256Hex?: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<OnChainVerificationResult> {
  const cleanId = normalizeDocumentId(docId);
  const contract = getReadOnlyContract(networkKey);
  const targetNet = MST_NETWORKS[networkKey] || MST_NETWORKS.testnet;

  if (!contract) {
    return {
      checked: false,
      isValid: false,
      exists: false,
      networkKey,
      error: `Smart contract is not deployed or configured on ${targetNet.name}.`,
    };
  }

  try {
    let bytes32Hash = ethers.ZeroHash;
    if (submittedSha256Hex) {
      try {
        bytes32Hash = hashToBytes32(submittedSha256Hex);
      } catch {
        bytes32Hash = ethers.ZeroHash;
      }
    }

    let activeResult = await contract.verifyDocument(cleanId, bytes32Hash);
    let [isValid, exists, registrant, registeredAt, isRevoked] = activeResult;
    let resolvedContract = contract;

    // If not found on active contract, check historical deployments (e.g. v1 deployment)
    if (!exists) {
      const historicalAddresses = getHistoricalContractAddresses(networkKey);
      for (const histAddr of historicalAddresses) {
        const histContract = getReadOnlyContractForAddress(histAddr, networkKey);
        if (histContract) {
          try {
            const histResult = await histContract.verifyDocument(cleanId, bytes32Hash);
            if (histResult[1]) {
              [isValid, exists, registrant, registeredAt, isRevoked] = histResult;
              resolvedContract = histContract;
              break;
            }
          } catch {}
        }
      }
    }

    let cleanHash = '';
    let docTypeStr: DocumentType | string = 'Other';

    if (exists) {
      try {
        const docDetails = await resolvedContract.getDocument(cleanId);
        const [onChainHash, , , docTypeIdx] = docDetails;
        if (onChainHash && onChainHash !== ethers.ZeroHash) {
          cleanHash = bytes32ToHash(onChainHash);
        }
        docTypeStr = DOCUMENT_TYPE_REVERSE_MAP[Number(docTypeIdx)] || 'Other';
      } catch {
        // Fallback if getDocument fails
      }
    }

    const registeredAtNum = Number(registeredAt);

    return {
      checked: true,
      isValid,
      exists,
      registrant: registrant !== ethers.ZeroAddress ? registrant : undefined,
      registeredAt: registeredAtNum > 0 ? registeredAtNum : undefined,
      isRevoked,
      documentHash: cleanHash,
      documentType: docTypeStr,
      networkKey,
      contractAddress: await resolvedContract.getAddress(),
    };
  } catch (err: any) {
    return {
      checked: false,
      isValid: false,
      exists: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Looks up on-chain document details by Document ID on the specified network.
 */
export async function getOnChainDetails(
  docId: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<OnChainDocumentDetails> {
  const cleanId = normalizeDocumentId(docId);
  const contract = getReadOnlyContract(networkKey);
  const targetNet = MST_NETWORKS[networkKey] || MST_NETWORKS.testnet;

  if (!contract) {
    return {
      exists: false,
      docId: cleanId,
      documentHash: '',
      registrant: '',
      registeredAt: 0,
      documentType: '',
      isRevoked: false,
      networkKey,
      error: `Contract not deployed on ${targetNet.name}.`,
    };
  }

  try {
    const doc = await contract.getDocument(cleanId);
    const [documentHash, registrant, registeredAt, docTypeIdx, isRevoked] = doc;
    const activeAddress = await contract.getAddress();

    return {
      exists: true,
      docId: cleanId,
      documentHash: bytes32ToHash(documentHash),
      registrant,
      registeredAt: Number(registeredAt),
      documentType: DOCUMENT_TYPE_REVERSE_MAP[Number(docTypeIdx)] || 'Other',
      isRevoked,
      networkKey,
      contractAddress: activeAddress,
      isHistorical: false,
    };
  } catch (err: any) {
    // If not found on active contract, check historical deployments (e.g. v1 deployment)
    const historicalAddresses = getHistoricalContractAddresses(networkKey);
    for (const histAddr of historicalAddresses) {
      const histContract = getReadOnlyContractForAddress(histAddr, networkKey);
      if (histContract) {
        try {
          const doc = await histContract.getDocument(cleanId);
          const [documentHash, registrant, registeredAt, docTypeIdx, isRevoked] = doc;
          return {
            exists: true,
            docId: cleanId,
            documentHash: bytes32ToHash(documentHash),
            registrant,
            registeredAt: Number(registeredAt),
            documentType: DOCUMENT_TYPE_REVERSE_MAP[Number(docTypeIdx)] || 'Other',
            isRevoked,
            networkKey,
            contractAddress: histAddr,
            isHistorical: true,
          };
        } catch {}
      }
    }

    return {
      exists: false,
      docId: cleanId,
      documentHash: '',
      registrant: '',
      registeredAt: 0,
      documentType: '',
      isRevoked: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Revoke an existing document on-chain on the specified network.
 */
export async function revokeOnChain(
  docId: string,
  reason: string,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<OnChainRevocationResult> {
  try {
    const cleanId = normalizeDocumentId(docId);
    const { contract, chainId, contractAddress } = await getSignerContract(rawProvider, networkKey);
    const tx = await contract.revokeDocument(cleanId, reason || 'Revoked by registrant');
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction execution failed or was reverted on-chain.');
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      networkKey,
      chainId,
      contractAddress,
    };
  } catch (err: any) {
    return {
      success: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Performs reverse lookup to find a Document ID by its SHA-256 hash digest on-chain.
 */
export async function getOnChainIdByHash(
  sha256Hex: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<string | null> {
  const contract = getReadOnlyContract(networkKey);
  if (!contract) return null;
  const bytes32Hash = hashToBytes32(sha256Hex);
  try {
    const docId = await contract.getDocumentIdByHash(bytes32Hash);
    if (docId && docId.trim().length > 0) return docId.trim();
  } catch {}

  // Check historical contract deployments
  const historicalAddresses = getHistoricalContractAddresses(networkKey);
  for (const histAddr of historicalAddresses) {
    const histContract = getReadOnlyContractForAddress(histAddr, networkKey);
    if (histContract) {
      try {
        const histDocId = await histContract.getDocumentIdByHash(bytes32Hash);
        if (histDocId && histDocId.trim().length > 0) return histDocId.trim();
      } catch {}
    }
  }

  return null;
}

/**
 * Wraps a promise with an explicit timeout to prevent RPC requests from hanging indefinitely.
 */
export async function withRpcTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 4000,
  timeoutMessage: string = 'RPC request timed out'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${timeoutMessage} (${timeoutMs}ms limit exceeded)`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RpcConnectivityResult {
  networkKey: MSTNetworkKey;
  rpcUrl: string;
  isReachable: boolean;
  chainIdDecimal?: number;
  blockNumber?: number;
  latencyMs?: number;
  error?: string;
}

/**
 * Tests RPC connectivity to the network's configured endpoint with bounded timeout and diagnostic details.
 */
export async function checkRpcConnectivity(
  networkKey: MSTNetworkKey = 'mainnet',
  timeoutMs = 4000
): Promise<RpcConnectivityResult> {
  const networkDef = MST_NETWORKS[networkKey] || MST_NETWORKS.mainnet;
  const start = Date.now();
  try {
    const provider = new ethers.JsonRpcProvider(networkDef.rpcUrl);
    const [network, blockNumber] = await withRpcTimeout(
      Promise.all([provider.getNetwork(), provider.getBlockNumber()]),
      timeoutMs,
      `RPC connectivity check to ${networkDef.rpcUrl} timed out`
    );
    const latencyMs = Date.now() - start;
    return {
      networkKey,
      rpcUrl: networkDef.rpcUrl,
      isReachable: true,
      chainIdDecimal: Number(network.chainId),
      blockNumber,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      networkKey,
      rpcUrl: networkDef.rpcUrl,
      isReachable: false,
      latencyMs,
      error: err?.message || 'RPC connectivity test failed.',
    };
  }
}

/**
 * Checks whether a Document ID has already been registered across both the active
 * contract registry and historical deployments (e.g. v1 contract with NV-2026-566456).
 *
 * Optimizations & Guards:
 * 1. Checks whether smart contract is deployed/configured on networkKey. If not, returns immediately
 *    without making unnecessary/failing RPC calls.
 * 2. Strictly forbids using Testnet contract addresses on Mainnet.
 * 3. Concurrently queries active and historical contracts using Promise.all with bounded timeouts.
 * 4. Never falsely claims an ID is unique if an RPC call fails.
 */
export async function checkDocumentIdExists(
  docId: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<DocumentIdCheckResult> {
  const cleanId = normalizeDocumentId(docId);
  if (!cleanId) {
    return { exists: false, docId: '' };
  }

  // 1. Guard: Check if contract is deployed/configured on this network
  if (!isContractConfigured(networkKey)) {
    return {
      exists: false,
      docId: cleanId,
      source: 'unconfigured',
      isContractDeployed: false,
      unverifiedOnChain: true,
      error: networkKey === 'mainnet'
        ? 'Mainnet smart contract is not yet deployed or configured (Chain ID 4646). On-chain uniqueness verification is unavailable.'
        : `Smart contract is not configured on ${networkKey}.`,
    };
  }

  // 2. Guard: Never allow Testnet contract address to be used on Mainnet
  const activeAddress = getContractAddressForNetwork(networkKey);
  if (networkKey === 'mainnet' && isTestnetContractAddress(activeAddress)) {
    console.warn('[NotaryVault:Security] Blocked attempt to query Testnet contract address on Mainnet.');
    return {
      exists: false,
      docId: cleanId,
      isContractDeployed: false,
      unverifiedOnChain: true,
      error: 'Security violation: Testnet contract address cannot be used for Mainnet verification.',
    };
  }

  // 3. Concurrent checks with bounded timeouts across active and historical deployments
  const checkPromises: Promise<{
    source: 'active_contract' | 'historical_contract';
    address: string;
    exists: boolean;
    registrant?: string;
    registeredAt?: number;
    isRevoked?: boolean;
    error?: string;
  }>[] = [];

  // Active deployed contract
  const contract = getReadOnlyContract(networkKey);
  if (contract) {
    checkPromises.push(
      withRpcTimeout(
        contract.verifyDocument(cleanId, ethers.ZeroHash),
        4000,
        `Active contract query on ${networkKey} timed out`
      ).then(res => ({
        source: 'active_contract' as const,
        address: activeAddress,
        exists: Boolean(res && res[1]),
        registrant: res && res[2] !== ethers.ZeroAddress ? res[2] : undefined,
        registeredAt: res && Number(res[3]) > 0 ? Number(res[3]) : undefined,
        isRevoked: Boolean(res[4]),
      })).catch(err => ({
        source: 'active_contract' as const,
        address: activeAddress,
        exists: false,
        error: err?.message || 'Active contract RPC call failed.',
      }))
    );
  }

  // Historical deployments (if any)
  const historicalAddresses = getHistoricalContractAddresses(networkKey);
  for (const histAddr of historicalAddresses) {
    if (histAddr.toLowerCase() === activeAddress.toLowerCase()) continue;
    // Security guard: Never check Testnet historical addresses on Mainnet
    if (networkKey === 'mainnet' && isTestnetContractAddress(histAddr)) continue;

    const histContract = getReadOnlyContractForAddress(histAddr, networkKey);
    if (histContract) {
      checkPromises.push(
        withRpcTimeout(
          histContract.verifyDocument(cleanId, ethers.ZeroHash),
          4000,
          `Historical contract (${histAddr.slice(0, 8)}...) query on ${networkKey} timed out`
        ).then(histRes => ({
          source: 'historical_contract' as const,
          address: histAddr,
          exists: Boolean(histRes && histRes[1]),
          registrant: histRes && histRes[2] !== ethers.ZeroAddress ? histRes[2] : undefined,
          registeredAt: histRes && Number(histRes[3]) > 0 ? Number(histRes[3]) : undefined,
          isRevoked: Boolean(histRes[4]),
        })).catch(err => ({
          source: 'historical_contract' as const,
          address: histAddr,
          exists: false,
          error: err?.message || 'Historical contract RPC call failed.',
        }))
      );
    }
  }

  // Await all checks concurrently
  const results = await Promise.all(checkPromises);

  // Check if any contract reported existing document
  const found = results.find(r => r.exists);
  if (found) {
    return {
      exists: true,
      docId: cleanId,
      source: found.source,
      contractAddress: found.address,
      registrant: found.registrant,
      registeredAt: found.registeredAt,
      isRevoked: found.isRevoked,
      isContractDeployed: true,
    };
  }

  // Check if any check failed with RPC error
  const failed = results.find(r => r.error);
  if (failed) {
    return {
      exists: false,
      docId: cleanId,
      error: failed.error,
      isContractDeployed: true,
      unverifiedOnChain: true,
    };
  }

  return {
    exists: false,
    docId: cleanId,
    isContractDeployed: true,
  };
}

/**
 * Helper to check if smart contract is currently configured for a given network.
 */
export function isContractConfigured(networkKey: MSTNetworkKey = 'testnet'): boolean {
  const address = getContractAddressForNetwork(networkKey);
  return Boolean(address && ethers.isAddress(address));
}

/**
 * Checks if an account is an authorized author (Super Author or approved Secondary Author) on-chain.
 */
export async function checkIsOnChainAuthor(
  walletAddress: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<boolean> {
  if (!walletAddress || !ethers.isAddress(walletAddress)) return false;
  const contract = getReadOnlyContract(networkKey);
  if (!contract) return false;

  try {
    if (typeof contract.isAuthor === 'function') {
      return await contract.isAuthor(walletAddress);
    }
  } catch {}

  try {
    const adminAddr = await contract.admin();
    if (adminAddr && adminAddr.toLowerCase() === walletAddress.toLowerCase()) {
      return true;
    }
  } catch {}

  try {
    if (typeof contract.authorizedAuthors === 'function') {
      return await contract.authorizedAuthors(walletAddress);
    }
  } catch {}

  return false;
}

/**
 * Checks if an account is the Super Author (contract admin).
 */
export async function checkIsOnChainSuperAuthor(
  walletAddress: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<boolean> {
  if (!walletAddress || !ethers.isAddress(walletAddress)) return false;
  const adminAddr = await getContractAdmin(networkKey);
  return Boolean(adminAddr && adminAddr.toLowerCase() === walletAddress.toLowerCase());
}

/**
 * Authorizes a Secondary Author on-chain (Super Author only).
 */
export async function authorizeAuthorOnChain(
  authorAddress: string,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{ success: boolean; txHash?: string; blockNumber?: number; contractAddress?: string; chainId?: string; networkKey?: MSTNetworkKey; error?: string }> {
  try {
    if (!authorAddress || !ethers.isAddress(authorAddress)) {
      throw new Error('Invalid author wallet address.');
    }

    const { contract, chainId } = await getSignerContract(rawProvider, networkKey);
    if (typeof contract.authorizeAuthor !== 'function') {
      throw new Error('Deployed smart contract does not support authorizeAuthor in its current version.');
    }

    const tx = await contract.authorizeAuthor(authorAddress);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction execution failed or was reverted on-chain.');
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      contractAddress: await contract.getAddress(),
      chainId,
      networkKey,
    };
  } catch (err: any) {
    return {
      success: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Deauthorizes a Secondary Author on-chain (Super Author only).
 */
export async function deauthorizeAuthorOnChain(
  authorAddress: string,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{ success: boolean; txHash?: string; blockNumber?: number; contractAddress?: string; chainId?: string; networkKey?: MSTNetworkKey; error?: string }> {
  try {
    if (!authorAddress || !ethers.isAddress(authorAddress)) {
      throw new Error('Invalid author wallet address.');
    }

    const { contract, chainId } = await getSignerContract(rawProvider, networkKey);
    if (typeof contract.deauthorizeAuthor !== 'function') {
      throw new Error('Deployed smart contract does not support deauthorizeAuthor in its current version.');
    }

    const tx = await contract.deauthorizeAuthor(authorAddress);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction execution failed or was reverted on-chain.');
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      contractAddress: await contract.getAddress(),
      chainId,
      networkKey,
    };
  } catch (err: any) {
    return {
      success: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Records an immutable document audit event on-chain. Super Author or Secondary Author.
 */
export async function recordAuditEventOnChain(
  docId: string,
  eventType: string,
  remarks: string,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{ success: boolean; txHash?: string; blockNumber?: number; contractAddress?: string; chainId?: string; networkKey?: MSTNetworkKey; error?: string }> {
  try {
    const cleanId = normalizeDocumentId(docId);
    if (!cleanId) {
      throw new Error('Document ID cannot be empty.');
    }

    const { contract, chainId } = await getSignerContract(rawProvider, networkKey);
    if (typeof contract.recordAuditEvent !== 'function') {
      throw new Error('Deployed smart contract does not support recordAuditEvent in its current version.');
    }

    const eventTypeBytes32 = ethers.encodeBytes32String(eventType.slice(0, 31));
    const tx = await contract.recordAuditEvent(cleanId, eventTypeBytes32, remarks || '');
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction execution failed or was reverted on-chain.');
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      contractAddress: await contract.getAddress(),
      chainId,
      networkKey,
    };
  } catch (err: any) {
    return {
      success: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Submits an on-chain author application from the applicant's connected wallet.
 */
export async function submitAuthorApplicationOnChain(
  appId: string,
  applicantName: string,
  organization: string,
  contactEmail: string,
  justification: string,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{ success: boolean; txHash?: string; blockNumber?: number; contractAddress?: string; chainId?: string; networkKey?: MSTNetworkKey; error?: string }> {
  try {
    const { contract, chainId } = await getSignerContract(rawProvider, networkKey);
    if (typeof contract.submitAuthorApplication !== 'function') {
      throw new Error('Deployed smart contract does not support submitAuthorApplication in its current version.');
    }

    const tx = await contract.submitAuthorApplication(
      appId,
      applicantName,
      organization,
      contactEmail,
      justification
    );
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction execution failed or was reverted on-chain.');
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      contractAddress: await contract.getAddress(),
      chainId,
      networkKey,
    };
  } catch (err: any) {
    return {
      success: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Reviews a pending author application on-chain (Approve or Reject). Super Author only.
 */
export async function reviewAuthorApplicationOnChain(
  applicantAddress: string,
  approve: boolean,
  reviewNotes: string,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{ success: boolean; txHash?: string; blockNumber?: number; contractAddress?: string; chainId?: string; networkKey?: MSTNetworkKey; error?: string }> {
  try {
    if (!applicantAddress || !ethers.isAddress(applicantAddress)) {
      throw new Error('Invalid applicant wallet address.');
    }

    const { contract, chainId } = await getSignerContract(rawProvider, networkKey);
    if (typeof contract.reviewAuthorApplication !== 'function') {
      throw new Error('Deployed smart contract does not support reviewAuthorApplication in its current version.');
    }

    const tx = await contract.reviewAuthorApplication(applicantAddress, approve, reviewNotes || '');
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction execution failed or was reverted on-chain.');
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      contractAddress: await contract.getAddress(),
      chainId,
      networkKey,
    };
  } catch (err: any) {
    return {
      success: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Retrieves an on-chain author application status for a wallet address without reverting.
 */
export async function getOnChainApplicationStatus(
  applicantAddress: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<number> {
  if (!applicantAddress || !ethers.isAddress(applicantAddress)) return 0;
  const contract = getReadOnlyContract(networkKey);
  if (!contract || typeof contract.getApplicationStatus !== 'function') return 0;
  try {
    const status = await contract.getApplicationStatus(applicantAddress);
    return Number(status);
  } catch {
    return 0;
  }
}

/**
 * Retrieves full on-chain author application details for an applicant address.
 */
export async function getOnChainApplication(
  applicantAddress: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{
  appId: string;
  applicant: string;
  appliedAt: string;
  reviewedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'None';
  applicantName: string;
  organization: string;
  contactEmail: string;
  justification: string;
  reviewNotes: string;
} | null> {
  if (!applicantAddress || !ethers.isAddress(applicantAddress)) return null;
  const contract = getReadOnlyContract(networkKey);
  if (!contract || typeof contract.getApplication !== 'function') return null;
  try {
    const raw = await contract.getApplication(applicantAddress);
    const appliedAtNum = raw[2] ? Number(raw[2]) : 0;
    if (appliedAtNum === 0 && (!raw[0] || raw[0] === '')) {
      return null;
    }

    const statusCode = Number(raw[4]);
    const statusMap: Record<number, 'None' | 'Pending' | 'Approved' | 'Rejected'> = {
      0: 'None',
      1: 'Pending',
      2: 'Approved',
      3: 'Rejected',
    };

    return {
      appId: raw[0] || '',
      applicant: raw[1] || applicantAddress,
      appliedAt: appliedAtNum ? new Date(appliedAtNum * 1000).toISOString() : '',
      reviewedAt: raw[3] && Number(raw[3]) ? new Date(Number(raw[3]) * 1000).toISOString() : '',
      status: statusMap[statusCode] || 'None',
      applicantName: raw[5] || '',
      organization: raw[6] || '',
      contactEmail: raw[7] || '',
      justification: raw[8] || '',
      reviewNotes: raw[9] || '',
    };
  } catch {
    return null;
  }
}

/**
 * Fetches all on-chain author applications by querying ApplicationSubmitted and
 * ApplicationReviewed events from the deployed block, fetching current application details.
 */
export async function fetchAllOnChainAuthorApplications(
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{ success: boolean; applications: AuthorApplication[]; error?: string }> {
  try {
    const contract = getReadOnlyContract(networkKey);
    if (!contract) {
      return { success: false, applications: [], error: `Contract not configured for ${networkKey}.` };
    }

    const netDeploy = deploymentConfig[networkKey];
    const fromBlock = (netDeploy && netDeploy.deployedAtBlock) ? netDeploy.deployedAtBlock : 0;

    // Query ApplicationSubmitted and ApplicationReviewed events
    const submitFilter = contract.filters.ApplicationSubmitted ? contract.filters.ApplicationSubmitted() : null;
    const reviewFilter = contract.filters.ApplicationReviewed ? contract.filters.ApplicationReviewed() : null;

    if (!submitFilter) {
      return { success: true, applications: [] };
    }

    const [submitEvents, reviewEvents] = await Promise.all([
      contract.queryFilter(submitFilter, fromBlock, 'latest').catch(() => []),
      reviewFilter ? contract.queryFilter(reviewFilter, fromBlock, 'latest').catch(() => []) : Promise.resolve([])
    ]);

    // Map by applicant address (lowercase)
    const applicantEventsMap = new Map<string, {
      submissionTxHash: string;
      submissionBlockNumber: number;
      submittedAtTimestamp?: number;
      approvalTxHash?: string;
      approvalBlockNumber?: number;
      reviewedBy?: string;
    }>();

    for (const ev of submitEvents) {
      try {
        const parsed = contract.interface.parseLog({ topics: ev.topics as string[], data: ev.data });
        if (parsed) {
          const applicant = (parsed.args.applicant || parsed.args[1] || '').toLowerCase();
          if (applicant) {
            applicantEventsMap.set(applicant, {
              submissionTxHash: ev.transactionHash,
              submissionBlockNumber: ev.blockNumber,
              submittedAtTimestamp: parsed.args.timestamp ? Number(parsed.args.timestamp) : undefined,
            });
          }
        }
      } catch {
        // Log parsing fallback
      }
    }

    for (const ev of reviewEvents) {
      try {
        const parsed = contract.interface.parseLog({ topics: ev.topics as string[], data: ev.data });
        if (parsed) {
          const applicant = (parsed.args.applicant || parsed.args[1] || '').toLowerCase();
          const existing = applicantEventsMap.get(applicant);
          if (existing) {
            existing.approvalTxHash = ev.transactionHash;
            existing.approvalBlockNumber = ev.blockNumber;
            existing.reviewedBy = parsed.args.reviewedBy || parsed.args[4];
          } else {
            applicantEventsMap.set(applicant, {
              submissionTxHash: ev.transactionHash,
              submissionBlockNumber: ev.blockNumber,
              approvalTxHash: ev.transactionHash,
              approvalBlockNumber: ev.blockNumber,
              reviewedBy: parsed.args.reviewedBy || parsed.args[4],
            });
          }
        }
      } catch {
        // Log parsing fallback
      }
    }

    // Now for each applicant, fetch latest on-chain state
    const apps: AuthorApplication[] = [];
    for (const [applicantAddr, evData] of applicantEventsMap.entries()) {
      const onChainData = await getOnChainApplication(applicantAddr, networkKey);
      if (onChainData && onChainData.status !== 'None') {
        apps.push({
          id: onChainData.appId || `APP-${applicantAddr.slice(2, 8).toUpperCase()}`,
          applicantWallet: ethers.getAddress(applicantAddr),
          applicantName: onChainData.applicantName || 'Verified Applicant',
          organization: onChainData.organization || 'Notary Applicant',
          licenseNumber: 'Verified On-Chain',
          contactEmail: onChainData.contactEmail || '',
          justification: onChainData.justification || '',
          submittedAt: onChainData.appliedAt || new Date().toISOString(),
          status: onChainData.status as any,
          reviewedAt: onChainData.reviewedAt || undefined,
          reviewedBy: evData.reviewedBy || undefined,
          reviewNotes: onChainData.reviewNotes || undefined,
          submissionTxHash: evData.submissionTxHash,
          submissionBlockNumber: evData.submissionBlockNumber,
          approvalTxHash: evData.approvalTxHash,
          approvalBlockNumber: evData.approvalBlockNumber,
          networkKey,
          isOnChain: true,
        });
      }
    }

    return {
      success: true,
      applications: apps,
    };
  } catch (err: any) {
    return {
      success: false,
      applications: [],
      error: parseContractError(err),
    };
  }
}

/**
 * Transfers Super Author role to a new validated address. Super Author only.
 */
export async function transferSuperAuthorOnChain(
  newSuperAuthorAddress: string,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<{ success: boolean; txHash?: string; blockNumber?: number; contractAddress?: string; chainId?: string; networkKey?: MSTNetworkKey; error?: string }> {
  try {
    if (!newSuperAuthorAddress || !ethers.isAddress(newSuperAuthorAddress)) {
      throw new Error('Invalid new Super Author wallet address.');
    }

    const { contract, chainId } = await getSignerContract(rawProvider, networkKey);
    if (typeof contract.transferSuperAuthor !== 'function') {
      throw new Error('Deployed smart contract does not support transferSuperAuthor in its current version.');
    }

    const tx = await contract.transferSuperAuthor(newSuperAuthorAddress);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction execution failed or was reverted on-chain.');
    }

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
      contractAddress: await contract.getAddress(),
      chainId,
      networkKey,
    };
  } catch (err: any) {
    return {
      success: false,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Returns deployment metadata for a specific network or full configuration.
 */
export function getDeploymentConfig(networkKey?: MSTNetworkKey) {
  if (networkKey) {
    const base = deploymentConfig[networkKey] || {};
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const storedJson = window.localStorage.getItem(`notaryvault_${networkKey}_deployment`);
        if (storedJson) {
          const parsed = JSON.parse(storedJson);
          return { ...base, ...parsed };
        }
        const storedAddr = window.localStorage.getItem(`notaryvault_${networkKey}_contract_address`);
        if (storedAddr && ethers.isAddress(storedAddr)) {
          return { ...base, contractAddress: storedAddr, deployed: true };
        }
      } catch {}
    }
    return base;
  }
  return deploymentConfig;
}

export interface RecoveredOnChainData {
  documents: DocumentRecord[];
  activities: ActivityEvent[];
  totalOnChain: number;
  networkKey: MSTNetworkKey;
  error?: string;
}

/**
 * Recovers all registered documents and activity timeline records from the on-chain smart contract
 * and historical event logs for the specified network.
 */
export async function recoverOnChainRecords(
  networkKey: MSTNetworkKey = 'testnet'
): Promise<RecoveredOnChainData> {
  const targetNet = MST_NETWORKS[networkKey] || MST_NETWORKS.testnet;
  const contract = getReadOnlyContract(networkKey);
  const contractAddress = getContractAddressForNetwork(networkKey);

  if (!contract || !contractAddress) {
    return {
      documents: [],
      activities: [],
      totalOnChain: 0,
      networkKey,
      error: `Smart contract is not configured on ${targetNet.name}.`,
    };
  }

  try {
    // 1. Check total registered count on-chain
    const totalOnChainBig = await contract.totalDocumentsRegistered();
    const totalOnChain = Number(totalOnChainBig);

    if (totalOnChain === 0) {
      return {
        documents: [],
        activities: [],
        totalOnChain: 0,
        networkKey,
      };
    }

    // 2. Determine initial deployment block
    const netConfig = deploymentConfig[networkKey] as any;
    let startBlock = netConfig?.deployedAtBlock || netConfig?.blockNumber || 0;
    if (startBlock > 20) {
      startBlock = startBlock - 20; // safety margin
    }

    // 3. Query DocumentRegistered events
    const regFilter = contract.filters.DocumentRegistered();
    let regLogs: ethers.EventLog[] = [];
    try {
      regLogs = (await contract.queryFilter(regFilter, startBlock, 'latest')) as ethers.EventLog[];
    } catch {
      try {
        regLogs = (await contract.queryFilter(regFilter, 'earliest', 'latest')) as ethers.EventLog[];
      } catch (rangeErr: any) {
        console.warn('Fallback block query error:', rangeErr);
      }
    }

    // 4. Query DocumentRevoked events
    const revFilter = contract.filters.DocumentRevoked();
    let revLogs: ethers.EventLog[] = [];
    try {
      revLogs = (await contract.queryFilter(revFilter, startBlock, 'latest')) as ethers.EventLog[];
    } catch {
      // non-fatal
    }

    // 5. Query AuditEventRecorded events
    const auditFilter = contract.filters.AuditEventRecorded();
    let auditLogs: ethers.EventLog[] = [];
    try {
      auditLogs = (await contract.queryFilter(auditFilter, startBlock, 'latest')) as ethers.EventLog[];
    } catch {
      // non-fatal
    }

    // Map revocations by docId
    const revokedDocIds = new Set<string>();
    const revocationReasons = new Map<string, string>();
    for (const rLog of revLogs) {
      const docId = rLog.args?.[1];
      const reason = rLog.args?.[3] || 'Revoked by registrant';
      if (docId) {
        revokedDocIds.add(docId.toUpperCase());
        revocationReasons.set(docId.toUpperCase(), reason);
      }
    }

    const recoveredDocuments: DocumentRecord[] = [];
    const recoveredActivities: ActivityEvent[] = [];

    // Process each registration event
    for (const log of regLogs) {
      try {
        const docId = log.args?.[1];
        const docHashRaw = log.args?.[2];
        const registrant = log.args?.[3];
        const docTypeIdx = Number(log.args?.[4] ?? 0);
        const timestampNum = Number(log.args?.[5] ?? 0);

        if (!docId) continue;

        const cleanDocId = docId.trim();
        const cleanHash = docHashRaw && docHashRaw !== ethers.ZeroHash ? bytes32ToHash(docHashRaw) : '';
        const docTypeStr: DocumentType = DOCUMENT_TYPE_REVERSE_MAP[docTypeIdx] || 'Property Deed';
        const isRevoked = revokedDocIds.has(cleanDocId.toUpperCase());

        const isoTimestamp = timestampNum > 0
          ? new Date(timestampNum * 1000).toISOString()
          : new Date().toISOString();
        const issueDate = isoTimestamp.slice(0, 10);

        const docName = cleanDocId === 'NV-2026-566456' ? 'Property Deed' : `${docTypeStr} (${cleanDocId})`;

        const docRecord: DocumentRecord = {
          id: cleanDocId,
          name: docName,
          type: docTypeStr,
          description: `Document anchored on-chain on ${targetNet.name}. Verified blockchain record.`,
          owner: registrant || 'On-Chain Registrant',
          issueDate,
          registeredAt: isoTimestamp,
          status: isRevoked ? 'Hash Mismatch' : 'Registered',
          sha256Hash: cleanHash,
          fileName: `${cleanDocId}.pdf`,
          fileSizeBytes: 0,
          qrPayloadUrl: `/verify/${cleanDocId}`,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber ? Number(log.blockNumber) : undefined,
          contractAddress: contractAddress,
          networkChainId: targetNet.chainIdHex,
          networkKey,
          networkName: targetNet.name,
          registrantAddress: registrant,
          onChainStatus: isRevoked ? 'revoked' : 'registered',
        };

        recoveredDocuments.push(docRecord);

        recoveredActivities.push({
          id: `act_${log.transactionHash || cleanDocId}_reg`,
          type: 'Document Registered',
          title: 'Document Anchored On-Chain',
          description: `Registered "${docName}" (${cleanDocId}) on ${targetNet.name}. Tx: ${log.transactionHash?.slice(0, 12)}...`,
          documentId: cleanDocId,
          timestamp: isoTimestamp,
          status: 'success',
          txHash: log.transactionHash,
          blockNumber: log.blockNumber ? Number(log.blockNumber) : undefined,
          networkKey,
          networkName: targetNet.name,
          chainId: targetNet.chainIdHex,
          contractAddress,
          isOnChain: true,
        });
      } catch (itemErr) {
        console.warn('Error processing on-chain log entry:', itemErr);
      }
    }

    // Process revocations into activities
    for (const rLog of revLogs) {
      const docId = rLog.args?.[1];
      const revokedBy = rLog.args?.[2];
      const reason = rLog.args?.[3] || 'Revoked on-chain';
      const tsNum = Number(rLog.args?.[4] ?? 0);
      const isoTs = tsNum > 0 ? new Date(tsNum * 1000).toISOString() : new Date().toISOString();

      if (docId) {
        recoveredActivities.push({
          id: `act_${rLog.transactionHash || docId}_rev`,
          type: 'Access Revoked',
          title: 'Document Revoked On-Chain',
          description: `Revocation recorded on-chain for ${docId}. Reason: ${reason}. Actor: ${revokedBy?.slice(0, 8)}...`,
          documentId: docId,
          timestamp: isoTs,
          status: 'warning',
          txHash: rLog.transactionHash,
          blockNumber: rLog.blockNumber ? Number(rLog.blockNumber) : undefined,
          networkKey,
          networkName: targetNet.name,
          chainId: targetNet.chainIdHex,
          contractAddress,
          isOnChain: true,
        });
      }
    }

    // Process audit events into activities
    for (const aLog of auditLogs) {
      const docId = aLog.args?.[1];
      const remarks = aLog.args?.[4] || 'Audit event';
      const tsNum = Number(aLog.args?.[5] ?? 0);
      const isoTs = tsNum > 0 ? new Date(tsNum * 1000).toISOString() : new Date().toISOString();

      if (docId) {
        recoveredActivities.push({
          id: `act_${aLog.transactionHash || docId}_aud`,
          type: 'Verification Completed',
          title: 'On-Chain Audit Event Recorded',
          description: `Lifecycle event for ${docId}: ${remarks}`,
          documentId: docId,
          timestamp: isoTs,
          status: 'info',
          txHash: aLog.transactionHash,
          blockNumber: aLog.blockNumber ? Number(aLog.blockNumber) : undefined,
          networkKey,
          networkName: targetNet.name,
          chainId: targetNet.chainIdHex,
          contractAddress,
          isOnChain: true,
        });
      }
    }

    return {
      documents: recoveredDocuments,
      activities: recoveredActivities,
      totalOnChain,
      networkKey,
    };
  } catch (err: any) {
    return {
      documents: [],
      activities: [],
      totalOnChain: 0,
      networkKey,
      error: parseContractError(err),
    };
  }
}

/**
 * Reads and verifies the current Super Author wallet address directly from the on-chain
 * smart contract registry via JSON-RPC.
 * Does not trust localStorage or client-side roles.
 */
export async function getOnChainSuperAuthor(networkKey?: MSTNetworkKey): Promise<string | null> {
  const networksToCheck: MSTNetworkKey[] = networkKey ? [networkKey] : ['mainnet', 'testnet'];
  for (const net of networksToCheck) {
    try {
      const netDef = MST_NETWORKS[net];
      const contractAddr = getContractAddressForNetwork(net);
      if (contractAddr && ethers.isAddress(contractAddr)) {
        const provider = new ethers.JsonRpcProvider(netDef.rpcUrl);
        const contract = new ethers.Contract(contractAddr, contractArtifact.abi, provider);
        const onChainAdmin = await contract.admin();
        if (onChainAdmin && ethers.isAddress(onChainAdmin)) {
          return onChainAdmin.toLowerCase();
        }
      }
    } catch {
      // Continue to next candidate network
    }
  }
  return null;
}

export interface DeploymentGasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  estimatedCostWei: bigint;
  estimatedCostFormatted: string;
}

/**
 * Safely estimates the gas fee required to deploy NotaryVaultRegistry on Mainnet.
 */
export async function estimateMainnetDeploymentGas(
  rawProvider: any
): Promise<DeploymentGasEstimate | null> {
  try {
    if (!rawProvider) return null;
    const browserProvider = new ethers.BrowserProvider(rawProvider);
    const signer = await browserProvider.getSigner();
    const signerAddress = await signer.getAddress();
    const factory = new ethers.ContractFactory(contractArtifact.abi, contractArtifact.bytecode, signer);
    const deployTx = await factory.getDeployTransaction(signerAddress);
    const gasLimit = await browserProvider.estimateGas(deployTx);
    const feeData = await browserProvider.getFeeData();
    const gasPrice = feeData.gasPrice || 1000000000n; // 1 gwei fallback
    const estimatedCostWei = gasLimit * gasPrice;
    return {
      gasLimit,
      gasPrice,
      estimatedCostWei,
      estimatedCostFormatted: ethers.formatEther(estimatedCostWei),
    };
  } catch {
    const fallbackGas = 3500000n;
    const fallbackPrice = 1000000000n;
    const estimatedCostWei = fallbackGas * fallbackPrice;
    return {
      gasLimit: fallbackGas,
      gasPrice: fallbackPrice,
      estimatedCostWei,
      estimatedCostFormatted: ethers.formatEther(estimatedCostWei),
    };
  }
}

export interface MainnetDeploymentResult {
  success: boolean;
  contractAddress?: string;
  txHash?: string;
  blockNumber?: number;
  deployerAddress?: string;
  error?: string;
}

/**
 * Executes on-chain deployment of NotaryVaultRegistry to MST Chain Mainnet.
 * Strict conditions:
 * 1. Connected wallet must be verified on-chain as current Super Author.
 * 2. Connected wallet must be on chain ID 4646 (0x1226).
 * 3. Verified NotaryVault contract must not already be configured on Mainnet.
 * 4. Waits for real mined transaction receipt (status === 1).
 * 5. Verifies deployed contract bytecode and essential methods on-chain before saving.
 */
export async function deployMainnetContract(
  rawProvider: any,
  onProgress?: (status: string) => void
): Promise<MainnetDeploymentResult> {
  if (!rawProvider) {
    throw new Error('No wallet provider detected. Please connect your BridgeKey or EVM wallet.');
  }

  const browserProvider = new ethers.BrowserProvider(rawProvider);
  const network = await browserProvider.getNetwork();
  const chainIdNumber = Number(network.chainId);

  // 1. Strict Chain ID verification
  if (chainIdNumber !== 4646) {
    throw new Error(
      `Incorrect network: Connected wallet is on Chain ID ${chainIdNumber} (0x${network.chainId.toString(16)}). Mainnet contract deployment requires MST Chain Mainnet (Chain ID: 4646 / 0x1226). Please switch networks in your wallet.`
    );
  }

  // 2. Strict Super Author authorization verification
  const signer = await browserProvider.getSigner();
  const signerAddress = await signer.getAddress();
  const onChainSuperAuthor = await getOnChainSuperAuthor();

  if (!onChainSuperAuthor || signerAddress.toLowerCase() !== onChainSuperAuthor.toLowerCase()) {
    throw new Error(
      `Unauthorized: Connected wallet ${signerAddress} is not verified on-chain as the current Super Author (${onChainSuperAuthor || 'unverified'}). Mainnet deployment is strictly restricted to the Super Author.`
    );
  }

  // 3. Pre-flight check: ensure valid contract is not already configured on Mainnet
  const existingConfigured = getContractAddressForNetwork('mainnet');
  if (existingConfigured && ethers.isAddress(existingConfigured)) {
    try {
      const code = await browserProvider.getCode(existingConfigured);
      if (code && code !== '0x' && code.length > 100) {
        return {
          success: false,
          contractAddress: existingConfigured,
          error: `A valid NotaryVaultRegistry smart contract is already deployed and configured on Mainnet at ${existingConfigured}. Duplicate deployment is blocked.`
        };
      }
    } catch {}
  }

  // 4. Verify balance
  const balance = await browserProvider.getBalance(signerAddress);
  if (balance === 0n) {
    throw new Error(
      `Insufficient funds: Deployer wallet ${signerAddress} has 0 MSTC balance on MST Chain Mainnet. You must fund this wallet with MSTC tokens for contract deployment gas fees.`
    );
  }

  onProgress?.('Preparing deployment transaction with project ABI and bytecode...');

  // 5. Instantiate ContractFactory with project artifact
  const factory = new ethers.ContractFactory(contractArtifact.abi, contractArtifact.bytecode, signer);

  onProgress?.('Awaiting wallet confirmation... Please approve the deployment transaction in your wallet.');

  // 6. Request deployment transaction through connected wallet
  let contract: ethers.BaseContract;
  try {
    contract = await factory.deploy(signerAddress);
  } catch (err: any) {
    const parsedErr = parseContractError(err);
    if (
      parsedErr.includes('rejected') || 
      parsedErr.includes('denied') || 
      parsedErr.includes('User denied') || 
      parsedErr.includes('ACTION_REJECTED')
    ) {
      throw new Error('Deployment transaction was rejected in your wallet.');
    }
    throw new Error(`Wallet deployment request failed: ${parsedErr}`);
  }

  const deployTx = (contract as any).deploymentTransaction();
  if (!deployTx) {
    throw new Error('Deployment transaction was not created by the wallet provider.');
  }

  const submittedTxHash = deployTx.hash;
  onProgress?.(`Transaction broadcast! Hash: ${submittedTxHash}. Waiting for on-chain block mining...`);

  // 7. Wait for actual transaction receipt
  const receipt = await deployTx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(
      `Deployment transaction failed or reverted on MST Chain Mainnet. Status: ${receipt?.status}`
    );
  }

  const deployedAddress = await contract.getAddress();
  onProgress?.(`Transaction confirmed in block #${receipt.blockNumber}. Verifying contract bytecode at ${deployedAddress}...`);

  // 8. Verify contract bytecode exists at deployed address
  const code = await browserProvider.getCode(deployedAddress);
  if (!code || code === '0x' || code.length <= 100) {
    throw new Error(
      `Verification failed: No contract bytecode exists at deployed address ${deployedAddress}.`
    );
  }

  // 9. Verify expected configuration and essential functions on-chain
  onProgress?.('Verifying contract admin and registry functions on-chain...');
  const deployedContract = new ethers.Contract(deployedAddress, contractArtifact.abi, browserProvider);
  const onChainAdmin = await deployedContract.admin();
  if (onChainAdmin.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(
      `Verification failed: Deployed contract admin (${onChainAdmin}) does not match expected deployer (${signerAddress}).`
    );
  }

  const totalDocs = await deployedContract.totalDocumentsRegistered();
  if (totalDocs !== 0n) {
    throw new Error('Verification failed: New registry initial document count is not zero.');
  }

  // 10. Persist verified deployment record
  const deploymentRecord = {
    network: 'MST Chain Mainnet',
    chainId: '0x1226',
    chainIdDecimal: 4646,
    rpcUrl: MST_NETWORKS.mainnet.rpcUrl,
    blockExplorerUrl: MST_NETWORKS.mainnet.explorerBaseUrl,
    nativeCurrency: { name: 'MSTC', symbol: 'MSTC', decimals: 18 },
    contractAddress: deployedAddress,
    deploymentTxHash: receipt.hash || submittedTxHash,
    deployedAtBlock: receipt.blockNumber ? Number(receipt.blockNumber) : null,
    deployerAddress: signerAddress,
    deployed: true,
    deployedAt: new Date().toISOString(),
  };

  await saveMainnetDeploymentRecord(deploymentRecord);

  onProgress?.('Deployment verified and saved successfully!');

  return {
    success: true,
    contractAddress: deployedAddress,
    txHash: receipt.hash || submittedTxHash,
    blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
    deployerAddress: signerAddress,
  };
}

/**
 * Persists Mainnet deployment record to memory, localStorage, and notifies backend server.
 */
export async function saveMainnetDeploymentRecord(record: any): Promise<void> {
  // 1. Update in-memory configuration
  if (deploymentConfig && deploymentConfig.mainnet) {
    deploymentConfig.mainnet.contractAddress = record.contractAddress;
    deploymentConfig.mainnet.deploymentTxHash = record.deploymentTxHash;
    deploymentConfig.mainnet.deployedAtBlock = record.deployedAtBlock;
    deploymentConfig.mainnet.deployerAddress = record.deployerAddress;
    deploymentConfig.mainnet.deployed = true;
    deploymentConfig.mainnet.deployedAt = record.deployedAt;
  }

  // 2. Persist in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('notaryvault_mainnet_contract_address', record.contractAddress);
      window.localStorage.setItem('notaryvault_mainnet_deployment', JSON.stringify(record));
    } catch (e) {
      console.warn('Could not save Mainnet deployment to localStorage:', e);
    }
  }

  // 3. Notify backend server to persist into src/contracts/deployment.json
  try {
    const backendUrl = typeof window !== 'undefined' && (window as any).__NOTARYVAULT_STORAGE_URL__
      ? (window as any).__NOTARYVAULT_STORAGE_URL__
      : 'http://localhost:5001';

    await fetch(`${backendUrl}/api/deployment/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Wallet-Address': record.deployerAddress || '',
      },
      body: JSON.stringify({
        networkKey: 'mainnet',
        contractAddress: record.contractAddress,
        txHash: record.deploymentTxHash,
        blockNumber: record.deployedAtBlock,
        deployerAddress: record.deployerAddress,
      }),
    });
  } catch {
    // Backend offline / optional — localStorage & memory remain active
  }

  // 4. Emit window event for components to reactively update
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notaryvault:mainnet-deployed', { detail: record }));
  }
}

