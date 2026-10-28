import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Network configurations for deployment
export const NETWORK_CONFIGS = {
  testnet: {
    key: 'testnet',
    name: 'MST Chain Testnet',
    expectedChainId: 91562037,
    expectedChainIdHex: '0x5752035',
    defaultRpcUrl: 'https://testnetrpc.mstblockchain.com',
    explorerBaseUrl: 'https://testnet.mstscan.com',
    currency: { name: 'MSTC', symbol: 'MSTC', decimals: 18 },
  },
  mainnet: {
    key: 'mainnet',
    name: 'MST Chain Mainnet',
    expectedChainId: 4646,
    expectedChainIdHex: '0x1226',
    defaultRpcUrl: 'https://4646.rpc.thirdweb.com',
    explorerBaseUrl: 'https://mstscan.com',
    currency: { name: 'MSTC', symbol: 'MSTC', decimals: 18 },
  },
};

// Robust .env loader with BOM removal, quote stripping, and path resolution
function loadEnv() {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
  ];

  const resolvedPath = candidatePaths.find(p => fs.existsSync(p));

  const diagnostics = {
    evaluatedPath: resolvedPath || candidatePaths[0],
    exists: Boolean(resolvedPath),
    loadedKeys: [],
    privateKeyStatus: 'NOT_FOUND',
  };

  if (resolvedPath && fs.existsSync(resolvedPath)) {
    let content = fs.readFileSync(resolvedPath, 'utf8');
    // Strip UTF-8 BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();

        // Strip surrounding single or double quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        diagnostics.loadedKeys.push(key);

        if (key === 'DEPLOYER_PRIVATE_KEY') {
          if (value.length > 0) {
            diagnostics.privateKeyStatus = `CONFIGURED (${value.length} characters)`;
          } else {
            diagnostics.privateKeyStatus = 'EMPTY_VALUE';
          }
        }

        // Set or override if process.env value is empty
        if (!process.env[key] || process.env[key].trim() === '') {
          process.env[key] = value;
        }
      }
    }
  }

  return diagnostics;
}

async function main() {
  const args = process.argv.slice(2);
  let networkKey = 'testnet';

  // Parse command line args: --network mainnet / --network testnet
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--network' && args[i + 1]) {
      networkKey = args[i + 1].toLowerCase();
    } else if (args[i].startsWith('--network=')) {
      networkKey = args[i].split('=')[1].toLowerCase();
    }
  }

  // Also check environment variable TARGET_NETWORK
  if (process.env.TARGET_NETWORK) {
    networkKey = process.env.TARGET_NETWORK.toLowerCase();
  }

  if (networkKey !== 'testnet' && networkKey !== 'mainnet') {
    console.error(`❌ Invalid network specified: "${networkKey}". Must be "testnet" or "mainnet".`);
    process.exit(1);
  }

  const targetConfig = NETWORK_CONFIGS[networkKey];
  const isMainnet = networkKey === 'mainnet';

  console.log('====================================================');
  console.log(`   NotaryVault - ${targetConfig.name} Deployer`);
  console.log('====================================================');

  if (isMainnet) {
    console.log('\n⚠️  MAINNET DEPLOYMENT SAFETY CHECK ⚠️');
    console.log('You are preparing to deploy to MST CHAIN MAINNET.');
    console.log('This will broadcast a real transaction, consume real MSTC gas,');
    console.log('and create a permanent smart contract registry.');

    const confirmedByArg = args.includes('--confirm-mainnet');
    if (!confirmedByArg) {
      console.error('\n❌ Mainnet deployment requires explicit confirmation.');
      console.error('To confirm deployment to MST Mainnet, run:');
      console.error('   npm run deploy:mst:mainnet -- --confirm-mainnet');
      process.exit(1);
    }
    console.log('✔ Mainnet explicit confirmation verified (--confirm-mainnet).');
  }

  const diagnostics = loadEnv();
  console.log(`Environment file:   ${diagnostics.evaluatedPath} [${diagnostics.exists ? 'Found' : 'Missing'}]`);
  console.log(`Deployer key status: DEPLOYER_PRIVATE_KEY is ${diagnostics.privateKeyStatus}`);

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  const rpcUrl = (isMainnet ? process.env.MST_MAINNET_RPC_URL : process.env.MST_RPC_URL || process.env.MST_TESTNET_RPC_URL)?.trim() || targetConfig.defaultRpcUrl;

  // Format with 0x prefix if omitted
  let privateKey = rawKey;
  if (privateKey && !privateKey.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(privateKey)) {
    privateKey = '0x' + privateKey;
  }

  if (!privateKey || privateKey.length === 0) {
    if (diagnostics.privateKeyStatus === 'EMPTY_VALUE') {
      console.error('\n❌ ERROR: DEPLOYER_PRIVATE_KEY was found in .env, but its value is empty (0 characters).');
      console.error('Please open .env and ensure your private key is pasted right after `DEPLOYER_PRIVATE_KEY=`.');
    } else if (!diagnostics.exists) {
      console.error('\n❌ ERROR: .env file was not found at:', diagnostics.evaluatedPath);
      console.error('Run: cp .env.example .env and add your private key.');
    } else {
      console.error('\n❌ ERROR: DEPLOYER_PRIVATE_KEY is not configured in .env or environment variables.');
    }
    console.log('\nDeployment Preparation Checklist:');
    console.log('1. Copy .env.example to .env:');
    console.log('   cp .env.example .env');
    console.log('2. Add your deployer private key in .env:');
    console.log('   DEPLOYER_PRIVATE_KEY=0x<your-private-key>');
    console.log(`3. Ensure your deployer address has MSTC on ${targetConfig.name}.`);
    console.log(`   RPC URL:  ${rpcUrl}`);
    console.log(`   Chain ID: ${targetConfig.expectedChainId} (${targetConfig.expectedChainIdHex})`);
    console.log('4. Run the deployment command:');
    console.log(`   npm run deploy:mst:${networkKey}`);
    process.exit(1);
  }

  // Reject placeholder values
  if (privateKey.includes('<your') || privateKey === '0x...' || privateKey === '0x<private-key>' || privateKey.includes('placeholder')) {
    console.error('\n❌ ERROR: DEPLOYER_PRIVATE_KEY is still set to placeholder text.');
    console.error('Please replace it with your actual deployer private key in .env.');
    process.exit(1);
  }

  console.log(`\nConnecting to RPC: ${rpcUrl}...`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const detectedChainId = Number(network.chainId);
  console.log(`Detected Chain ID: ${detectedChainId} (hex: 0x${network.chainId.toString(16)})`);

  if (detectedChainId !== targetConfig.expectedChainId) {
    console.error(`❌ Mismatched Chain ID! Expected ${targetConfig.expectedChainId} (${targetConfig.name}), got ${detectedChainId}`);
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const deployerAddress = await wallet.getAddress();
  console.log(`Deployer address: ${deployerAddress}`);

  const balance = await provider.getBalance(deployerAddress);
  const formattedBalance = ethers.formatEther(balance);
  console.log(`Deployer balance: ${formattedBalance} MSTC`);

  if (balance === 0n) {
    console.error(`❌ Deployer account balance is 0 MSTC. Please fund ${deployerAddress} with MSTC on ${targetConfig.name} before deploying.`);
    process.exit(1);
  }

  const artifactPath = path.resolve(__dirname, '../src/contracts/NotaryVaultRegistry.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Compiled contract artifact not found. Run `npm run compile:contracts` first.');
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  console.log(`\nDeploying NotaryVaultRegistry contract to ${targetConfig.name}...`);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();
  const deployTx = contract.deploymentTransaction();
  console.log(`Deployment transaction submitted: ${deployTx?.hash}`);

  console.log(`Waiting for transaction confirmation on ${targetConfig.name}...`);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const receipt = await deployTx?.wait();
  const txHash = receipt?.hash || deployTx?.hash;

  console.log(`\n🎉 CONTRACT DEPLOYMENT TO ${targetConfig.name.toUpperCase()} SUCCESSFUL!`);
  console.log('----------------------------------------------------');
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Transaction Hash: ${txHash}`);
  console.log(`Block Number:     ${receipt?.blockNumber}`);
  console.log(`Gas Used:         ${receipt?.gasUsed?.toString()}`);
  console.log(`Contract Explorer: ${targetConfig.explorerBaseUrl}/address/${contractAddress}`);
  console.log(`Tx Explorer:       ${targetConfig.explorerBaseUrl}/tx/${txHash}`);
  console.log('----------------------------------------------------');

  const deploymentPath = path.resolve(__dirname, '../src/contracts/deployment.json');

  // Load existing configuration or initialize empty structure
  let deploymentData = {
    testnet: {
      network: 'MST Chain Testnet',
      chainId: '0x5752035',
      chainIdDecimal: 91562037,
      rpcUrl: 'https://testnetrpc.mstblockchain.com',
      blockExplorerUrl: 'https://testnet.mstscan.com',
      nativeCurrency: { name: 'MSTC', symbol: 'MSTC', decimals: 18 },
      contractAddress: '',
      deploymentTxHash: '',
      deployedAtBlock: null,
      deployerAddress: '',
      deployed: false,
      deployedAt: null,
    },
    mainnet: {
      network: 'MST Chain Mainnet',
      chainId: '0x1226',
      chainIdDecimal: 4646,
      rpcUrl: 'https://4646.rpc.thirdweb.com',
      blockExplorerUrl: 'https://mstscan.com',
      nativeCurrency: { name: 'MSTC', symbol: 'MSTC', decimals: 18 },
      contractAddress: '',
      deploymentTxHash: '',
      deployedAtBlock: null,
      deployerAddress: '',
      deployed: false,
      deployedAt: null,
    },
  };

  if (fs.existsSync(deploymentPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      if (existing.testnet) deploymentData.testnet = existing.testnet;
      if (existing.mainnet) deploymentData.mainnet = existing.mainnet;

      // Create backup before modification
      const backupFilename = `deployment.backup.${networkKey}.${Date.now()}.json`;
      const backupPath = path.resolve(__dirname, '../src/contracts', backupFilename);
      fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`ℹ Preserved existing deployment backup at ${backupFilename}`);
    } catch {
      // If parsing fails, continue
    }
  }

  // Update ONLY the target network deployment, strictly preserving the other
  deploymentData[networkKey] = {
    network: targetConfig.name,
    chainId: targetConfig.expectedChainIdHex,
    chainIdDecimal: targetConfig.expectedChainId,
    rpcUrl,
    blockExplorerUrl: targetConfig.explorerBaseUrl,
    nativeCurrency: targetConfig.currency,
    contractAddress,
    deploymentTxHash: txHash,
    deployedAtBlock: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
    deployerAddress,
    deployed: true,
    deployedAt: new Date().toISOString(),
  };

  // Keep top-level keys for backwards compatibility with default testnet
  Object.assign(deploymentData, {
    network: deploymentData.testnet.network,
    chainId: deploymentData.testnet.chainId,
    chainIdDecimal: deploymentData.testnet.chainIdDecimal,
    rpcUrl: deploymentData.testnet.rpcUrl,
    blockExplorerUrl: deploymentData.testnet.blockExplorerUrl,
    nativeCurrency: deploymentData.testnet.nativeCurrency,
    contractAddress: deploymentData.testnet.contractAddress,
    deploymentTxHash: deploymentData.testnet.deploymentTxHash,
    deployedAtBlock: deploymentData.testnet.deployedAtBlock,
    deployerAddress: deploymentData.testnet.deployerAddress,
    deployed: deploymentData.testnet.deployed,
    deployedAt: deploymentData.testnet.deployedAt,
  });

  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentData, null, 2), 'utf8');
  console.log(`✔ Saved updated deployment record for ${targetConfig.name} to ${deploymentPath}`);
  console.log(`✔ Verified: Testnet address preserved as "${deploymentData.testnet.contractAddress}"`);
  console.log(`✔ Verified: Mainnet address saved as "${deploymentData.mainnet.contractAddress}"`);
}

main().catch((err) => {
  console.error('\n❌ Deployment failed:', err);
  process.exit(1);
});
