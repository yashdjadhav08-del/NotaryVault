import { ethers } from 'ethers';
import deploymentData from '../contracts/deployment.json';
import contractArtifact from '../contracts/NotaryVaultRegistry.json';
import { hashToBytes32, bytes32ToHash } from '../lib/hash';
import type { DocumentType } from '../types';

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
    rpcUrl: deploymentConfig.mainnet?.rpcUrl || 'https://4646.rpc.thirdweb.com',
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
  error?: string;
}

export interface OnChainRevocationResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  networkKey?: MSTNetworkKey;
  error?: string;
}

/**
 * Returns the deployed contract address for a given network, or empty string if not deployed.
 */
export function getContractAddressForNetwork(networkKey: MSTNetworkKey = 'testnet'): string {
  const networkSection = deploymentConfig[networkKey];
  if (networkSection && networkSection.contractAddress && ethers.isAddress(networkSection.contractAddress)) {
    return networkSection.contractAddress.trim();
  }
  // Fallback to top-level if checking testnet
  if (networkKey === 'testnet' && deploymentConfig.contractAddress && ethers.isAddress(deploymentConfig.contractAddress)) {
    return deploymentConfig.contractAddress.trim();
  }
  return '';
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
): Promise<{ contract: ethers.Contract; signer: ethers.Signer; chainId: string; networkKey: MSTNetworkKey }> {
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
        'Smart contract has not been deployed to MST Chain Mainnet yet. Run `npm run deploy:mst:mainnet` to deploy.'
      );
    }
    throw new Error(
      'Smart contract has not been deployed to MST Chain Testnet yet. Run `npm run deploy:mst` to deploy.'
    );
  }

  const signer = await browserProvider.getSigner();
  const contract = new ethers.Contract(contractAddress, contractArtifact.abi, signer);
  return { contract, signer, chainId: currentChainIdHex, networkKey };
}

/**
 * Decodes smart contract custom revert errors and wallet exceptions into user-friendly explanations.
 */
export function parseContractError(err: any): string {
  if (!err) return 'Unknown error occurred.';

  // User rejection
  if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
    return 'Transaction rejected in wallet.';
  }

  // Insufficient balance
  if (err.code === 'INSUFFICIENT_FUNDS' || (err.message && err.message.includes('insufficient funds'))) {
    return 'Insufficient MSTC balance to pay for transaction gas.';
  }

  // Custom contract errors decoded via ABI interface
  const iface = new ethers.Interface(contractArtifact.abi);
  const data = err.data || err.info?.error?.data || err.error?.data;
  if (data) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) {
        switch (parsed.name) {
          case 'EmptyDocumentId':
            return 'Document ID cannot be empty.';
          case 'ZeroDocumentHash':
            return 'Document hash cannot be zero.';
          case 'DocumentAlreadyExists':
            return 'This Document ID is already registered on MST Chain.';
          case 'HashAlreadyRegistered':
            return 'This file SHA-256 hash has already been registered on MST Chain under another document ID.';
          case 'InvalidDocumentType':
            return 'Invalid document category specified.';
          case 'DocumentAlreadyRevoked':
            return 'This document has already been revoked on-chain.';
          case 'UnauthorizedCaller':
            return 'Unauthorized: Only the original registrant or contract administrator can execute this operation.';
          case 'DocumentNotFound':
            return 'Document was not found in the on-chain registry.';
          default:
            return `Contract reverted: ${parsed.name}`;
        }
      }
    } catch {
      // Fallback
    }
  }

  if (err.shortMessage) return err.shortMessage;
  if (err.message) return err.message;
  return 'Smart contract operation failed.';
}

/**
 * Register a document on-chain using the connected BridgeKey wallet on the active network.
 */
export async function registerOnChain(
  docId: string,
  sha256Hex: string,
  docType: DocumentType,
  rawProvider: any,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<OnChainRegistrationResult> {
  try {
    // 1. Validate and convert hash
    const bytes32Hash = hashToBytes32(sha256Hex);
    const typeIndex = DOCUMENT_TYPE_MAP[docType] ?? 0;

    // 2. Obtain signer contract with network check
    const { contract, signer, chainId } = await getSignerContract(rawProvider, networkKey);
    const registrantAddress = await signer.getAddress();

    // 3. Submit transaction
    const tx = await contract.registerDocument(docId.trim(), bytes32Hash, typeIndex);

    // 4. Await mining receipt
    const receipt = await tx.wait();

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

    const result = await contract.verifyDocument(docId.trim(), bytes32Hash);
    const [isValid, exists, registrant, registeredAt, isRevoked] = result;

    let cleanHash = '';
    let docTypeStr: DocumentType | string = 'Other';

    if (exists) {
      try {
        const docDetails = await contract.getDocument(docId.trim());
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
      contractAddress: await contract.getAddress(),
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
  const contract = getReadOnlyContract(networkKey);
  const targetNet = MST_NETWORKS[networkKey] || MST_NETWORKS.testnet;

  if (!contract) {
    return {
      exists: false,
      docId,
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
    const doc = await contract.getDocument(docId.trim());
    const [documentHash, registrant, registeredAt, docTypeIdx, isRevoked] = doc;

    return {
      exists: true,
      docId,
      documentHash: bytes32ToHash(documentHash),
      registrant,
      registeredAt: Number(registeredAt),
      documentType: DOCUMENT_TYPE_REVERSE_MAP[Number(docTypeIdx)] || 'Other',
      isRevoked,
      networkKey,
    };
  } catch (err: any) {
    return {
      exists: false,
      docId,
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
    const { contract } = await getSignerContract(rawProvider, networkKey);
    const tx = await contract.revokeDocument(docId.trim(), reason || 'Revoked by registrant');
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : undefined,
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
 * Performs reverse lookup to find a Document ID by its SHA-256 hash digest on-chain.
 */
export async function getOnChainIdByHash(
  sha256Hex: string,
  networkKey: MSTNetworkKey = 'testnet'
): Promise<string | null> {
  const contract = getReadOnlyContract(networkKey);
  if (!contract) return null;
  try {
    const bytes32Hash = hashToBytes32(sha256Hex);
    const docId = await contract.getDocumentIdByHash(bytes32Hash);
    return docId && docId.trim().length > 0 ? docId.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Helper to check if smart contract is currently configured for a given network.
 */
export function isContractConfigured(networkKey: MSTNetworkKey = 'testnet'): boolean {
  const address = getContractAddressForNetwork(networkKey);
  return Boolean(address && ethers.isAddress(address));
}

/**
 * Returns deployment metadata for a specific network or full configuration.
 */
export function getDeploymentConfig(networkKey?: MSTNetworkKey) {
  if (networkKey && deploymentConfig[networkKey]) {
    return deploymentConfig[networkKey];
  }
  return deploymentConfig;
}
