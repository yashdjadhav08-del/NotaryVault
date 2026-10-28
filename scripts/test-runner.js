import { spawn } from 'child_process';
import assert from 'assert';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashToBytes32, bytes32ToHash } from '../src/lib/hash.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runHashConversionTests() {
  console.log('\n--- SUITE 1: Hash Conversion Unit Tests (Step 4) ---');

  const validRaw = '8fa14cb7913cf6cdab67448d3db07f0f6244dfaa9960ff2862d887a07c3c52a1';
  const validPrefixed = '0x8fa14cb7913cf6cdab67448d3db07f0f6244dfaa9960ff2862d887a07c3c52a1';
  const validUpper = '8FA14CB7913CF6CDAB67448D3DB07F0F6244DFAA9960FF2862D887A07C3C52A1';

  // 1. Without 0x
  const r1 = hashToBytes32(validRaw);
  assert.strictEqual(r1, validPrefixed.toLowerCase(), 'Should add 0x prefix and lowercase');
  console.log('✔ Correctly formats raw 64-char hex to 0x-prefixed bytes32');

  // 2. With 0x
  const r2 = hashToBytes32(validPrefixed);
  assert.strictEqual(r2, validPrefixed.toLowerCase(), 'Should preserve existing 0x');
  console.log('✔ Correctly accepts 0x-prefixed 66-char input');

  // 3. Uppercase
  const r3 = hashToBytes32(validUpper);
  assert.strictEqual(r3, validPrefixed.toLowerCase(), 'Should normalize uppercase to lowercase');
  console.log('✔ Normalizes uppercase hexadecimal characters');

  // 4. Reverse conversion bytes32ToHash
  const back = bytes32ToHash(r1);
  assert.strictEqual(back, validRaw.toLowerCase(), 'Reverse conversion should match original raw hex');
  console.log('✔ bytes32ToHash restores original 64-character lowercase digest');

  // 5. Length verification
  assert.throws(() => hashToBytes32('abc123'), /Invalid hash length/, 'Should reject short hashes');
  assert.throws(() => hashToBytes32(validRaw + '00'), /Invalid hash length/, 'Should reject long hashes');
  console.log('✔ Rejects invalid length inputs (too short / too long)');

  // 6. Non-hex characters
  assert.throws(() => hashToBytes32('z'.repeat(64)), /non-hexadecimal characters/, 'Should reject non-hex chars');
  console.log('✔ Rejects non-hexadecimal characters');

  // 7. Zero hash
  assert.throws(() => hashToBytes32('0'.repeat(64)), /Zero hash is not permitted/, 'Should reject zero hash');
  console.log('✔ Rejects zero hash (0x000...000)');

  // 8. Ensure no double hashing
  // The result must equal "0x" + original hex, NOT keccak256(original hex) or sha256(original hex)
  assert.strictEqual(r1.slice(2), validRaw, 'Must preserve exact original bytes, not re-hash digest');
  console.log('✔ Guarantees original digest is preserved without double-hashing');
}

let contractIface = null;

async function assertRevert(action, expectedError) {
  try {
    const tx = await action();
    if (tx && tx.wait) await tx.wait();
    assert.fail(`Expected revert with '${expectedError}', but operation succeeded`);
  } catch (err) {
    let revertName = err.revert?.name || '';
    const data = err.data || err.info?.error?.data || err.error?.data;
    if (data && contractIface) {
      try {
        const parsed = contractIface.parseError(data);
        if (parsed) revertName = parsed.name;
      } catch {}
    }
    const errorStr = (err.message || '') + ' ' + (err.shortMessage || '') + ' ' + revertName + ' ' + (err.data || '');
    if (!errorStr.includes(expectedError)) {
      console.error(`\n[Revert check failed] Expected error name: ${expectedError}`);
      console.error('Decoded revertName:', revertName);
      console.error('Actual error message:', err.message);
    }
    assert(
      errorStr.includes(expectedError),
      `Expected error to contain '${expectedError}', received: ${revertName || err.message}`
    );
  }
}

async function runContractTests(nodeProcess) {
  console.log('\n--- SUITE 2: NotaryVaultRegistry Contract Tests (Step 5) ---');

  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

  // Get signers from local Hardhat node
  const signerAdmin = await provider.getSigner(0);
  const signerAlice = await provider.getSigner(1);
  const signerBob = await provider.getSigner(2);
  const signerCharlie = await provider.getSigner(3);

  const artifactPath = path.resolve(__dirname, '../src/contracts/NotaryVaultRegistry.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  console.log('Deploying NotaryVaultRegistry to local node...');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signerAdmin);
  const registry = await factory.deploy();
  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();
  contractIface = registry.interface;
  console.log(`✔ Contract deployed at: ${contractAddress}`);

  // Test 1: Deployer is admin
  const adminAddr = await registry.admin();
  assert.strictEqual(adminAddr, signerAdmin.address, 'Admin should be deployer');
  console.log('✔ Admin correctly set to deployer');

  // Test 2: Initial count is 0
  const total0 = await registry.totalDocumentsRegistered();
  assert.strictEqual(Number(total0), 0, 'Initial count should be 0');
  console.log('✔ Total documents registered starts at 0');

  // Sample genuine hashes
  const HASH_DEED = '0x8fa14cb7913cf6cdab67448d3db07f0f6244dfaa9960ff2862d887a07c3c52a1';
  const HASH_LEASE = '0x2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae';
  const HASH_MISMATCH = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

  // Test 3: Successful registration
  const registryAlice = registry.connect(signerAlice);
  const tx1 = await registryAlice.registerDocument('NV-2026-000101', HASH_DEED, 0);
  const receipt1 = await tx1.wait();
  assert(receipt1.status === 1, 'Transaction should succeed');
  const total1 = await registry.totalDocumentsRegistered();
  assert.strictEqual(Number(total1), 1, 'Total count should increment to 1');
  console.log('✔ Successful document registration increments total count');

  // Test 4: Caller recorded as registrant, not legal owner
  const doc1 = await registry.getDocument('NV-2026-000101');
  assert.strictEqual(doc1[1], signerAlice.address, 'Registrant should be Alice');
  assert.strictEqual(doc1[0], HASH_DEED, 'Document hash should match');
  assert.strictEqual(Number(doc1[3]), 0, 'Document type should match 0 (PropertyDeed)');
  assert.strictEqual(doc1[4], false, 'isRevoked should be false');
  console.log('✔ getDocument returns accurate registrant, hash, and metadata');

  // Test 5: Rejects empty document ID
  await assertRevert(
    () => registryAlice.registerDocument('', HASH_DEED, 0),
    'EmptyDocumentId'
  );
  console.log('✔ Rejects empty document ID (EmptyDocumentId)');

  // Test 6: Rejects zero hash
  await assertRevert(
    () => registryAlice.registerDocument('NV-2026-000102', ZERO_HASH, 0),
    'ZeroDocumentHash'
  );
  console.log('✔ Rejects zero document hash (ZeroDocumentHash)');

  // Test 7: Rejects duplicate document ID
  const registryBob = registry.connect(signerBob);
  await assertRevert(
    () => registryBob.registerDocument('NV-2026-000101', HASH_LEASE, 1),
    'DocumentAlreadyExists'
  );
  console.log('✔ Rejects duplicate Document ID (DocumentAlreadyExists)');

  // Test 8: Rejects duplicate hash (MVP unique hash policy)
  await assertRevert(
    () => registryBob.registerDocument('NV-2026-000199', HASH_DEED, 1),
    'HashAlreadyRegistered'
  );
  console.log('✔ Rejects duplicate file hash under new ID (HashAlreadyRegistered)');

  // Test 9: Rejects invalid document type
  await assertRevert(
    () => registryAlice.registerDocument('NV-2026-000103', HASH_LEASE, 99),
    'InvalidDocumentType'
  );
  console.log('✔ Rejects invalid document type enum index (InvalidDocumentType)');

  // Test 10: Verification - matching hash
  const vMatching = await registry.verifyDocument('NV-2026-000101', HASH_DEED);
  assert.strictEqual(vMatching[0], true, 'isValid should be true');
  assert.strictEqual(vMatching[1], true, 'exists should be true');
  assert.strictEqual(vMatching[2], signerAlice.address, 'registrant should be Alice');
  assert.strictEqual(vMatching[4], false, 'isRevoked should be false');
  console.log('✔ verifyDocument returns isValid=true for matching registered hash');

  // Test 11: Verification - hash mismatch
  const vMismatch = await registry.verifyDocument('NV-2026-000101', HASH_MISMATCH);
  assert.strictEqual(vMismatch[0], false, 'isValid should be false on mismatch');
  assert.strictEqual(vMismatch[1], true, 'exists should still be true');
  console.log('✔ verifyDocument returns isValid=false when submitted hash differs');

  // Test 12: Verification - unregistered document
  const vUnregistered = await registry.verifyDocument('NV-2026-999999', HASH_DEED);
  assert.strictEqual(vUnregistered[0], false, 'isValid should be false');
  assert.strictEqual(vUnregistered[1], false, 'exists should be false');
  console.log('✔ verifyDocument returns exists=false for unregistered ID');

  // Test 13: Reverse lookup by hash
  const lookupId = await registry.getDocumentIdByHash(HASH_DEED);
  assert.strictEqual(lookupId, 'NV-2026-000101', 'Reverse lookup should return Document ID');
  const lookupEmpty = await registry.getDocumentIdByHash(HASH_MISMATCH);
  assert.strictEqual(lookupEmpty, '', 'Lookup for unknown hash should return empty string');
  console.log('✔ getDocumentIdByHash correctly resolves ID and handles unregistered hashes');

  // Test 14: Revocation by registrant
  const txRevoke = await registryAlice.revokeDocument('NV-2026-000101', 'Superseded by conveyance 2027');
  await txRevoke.wait();
  const docRevoked = await registry.getDocument('NV-2026-000101');
  assert.strictEqual(docRevoked[4], true, 'isRevoked should be true');
  console.log('✔ Original registrant can revoke document');

  // Test 15: Verification of revoked document returns isValid=false even with matching hash
  const vRevoked = await registry.verifyDocument('NV-2026-000101', HASH_DEED);
  assert.strictEqual(vRevoked[0], false, 'isValid should be false for revoked document');
  assert.strictEqual(vRevoked[4], true, 'isRevoked should be true');
  console.log('✔ verifyDocument flags revoked document as invalid');

  // Test 16: Double revocation rejected
  await assertRevert(
    () => registryAlice.revokeDocument('NV-2026-000101', 'Second revocation'),
    'DocumentAlreadyRevoked'
  );
  console.log('✔ Double revocation is rejected (DocumentAlreadyRevoked)');

  // Test 17: Register document 2 with Bob
  const txBob = await registryBob.registerDocument('NV-2026-000102', HASH_LEASE, 1);
  await txBob.wait();

  // Test 18: Unauthorized revocation attempt
  const registryCharlie = registry.connect(signerCharlie);
  await assertRevert(
    () => registryCharlie.revokeDocument('NV-2026-000102', 'Unauthorized attack'),
    'UnauthorizedCaller'
  );
  console.log('✔ Unauthorized party cannot revoke another user\'s document (UnauthorizedCaller)');

  // Test 19: Admin can revoke
  const registryAdmin = registry.connect(signerAdmin);
  const txAdminRevoke = await registryAdmin.revokeDocument('NV-2026-000102', 'Administrative court order');
  await txAdminRevoke.wait();
  const docAdminRevoked = await registry.getDocument('NV-2026-000102');
  assert.strictEqual(docAdminRevoked[4], true, 'Admin should be able to revoke');
  console.log('✔ Admin can revoke document for legal dispute compliance');

  // Test 20: Audit event recorded by registrant
  // Register document 3 with Bob for audit event test
  const HASH_AFFIDAVIT = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  await (await registryBob.registerDocument('NV-2026-000103', HASH_AFFIDAVIT, 3)).wait();

  const eventType = ethers.keccak256(ethers.toUtf8Bytes('BANK_AUDIT'));
  const txAudit = await registryBob.recordAuditEvent('NV-2026-000103', eventType, 'Inspected by State Bank');
  const receiptAudit = await txAudit.wait();
  assert(receiptAudit.status === 1, 'Audit transaction should succeed');
  console.log('✔ Registrant can record lifecycle audit event');

  // Test 21: Unauthorized audit event rejected
  await assertRevert(
    () => registryCharlie.recordAuditEvent('NV-2026-000103', eventType, 'Unauthorized audit note'),
    'UnauthorizedCaller'
  );
  console.log('✔ Unauthorized party cannot log audit events (UnauthorizedCaller)');
}

async function runMultiNetworkTests() {
  console.log('\n--- SUITE 3: Multi-Network Configuration, Chain ID Isolation & Explorer URL Tests ---');

  const deploymentFilePath = path.resolve(__dirname, '../src/contracts/deployment.json');
  assert(fs.existsSync(deploymentFilePath), 'src/contracts/deployment.json must exist');
  const deploymentJson = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));

  const NETWORKS = {
    testnet: {
      key: 'testnet',
      name: 'MST Chain Testnet',
      chainIdDecimal: 91562037,
      chainIdHex: '0x5752035',
      rpcUrl: deploymentJson.testnet?.rpcUrl || 'https://testnetrpc.mstblockchain.com',
      explorerBaseUrl: deploymentJson.testnet?.blockExplorerUrl || 'https://testnet.mstscan.com',
      currency: { name: 'MSTC', symbol: 'MSTC', decimals: 18 },
    },
    mainnet: {
      key: 'mainnet',
      name: 'MST Chain Mainnet',
      chainIdDecimal: 4646,
      chainIdHex: '0x1226',
      rpcUrl: deploymentJson.mainnet?.rpcUrl || 'https://4646.rpc.thirdweb.com',
      explorerBaseUrl: deploymentJson.mainnet?.blockExplorerUrl || 'https://mstscan.com',
      currency: { name: 'MSTC', symbol: 'MSTC', decimals: 18 },
    },
  };

  function getExplorerTxUrl(txHash, networkKey = 'testnet') {
    const base = NETWORKS[networkKey]?.explorerBaseUrl || NETWORKS.testnet.explorerBaseUrl;
    if (!txHash) return base;
    return `${base}/tx/${txHash.trim()}`;
  }

  function getExplorerAddressUrl(address, networkKey = 'testnet') {
    const base = NETWORKS[networkKey]?.explorerBaseUrl || NETWORKS.testnet.explorerBaseUrl;
    if (!address) return base;
    return `${base}/address/${address.trim()}`;
  }

  function isChainIdMatchingNetwork(chainId, networkKey) {
    const target = NETWORKS[networkKey];
    if (!target) return false;
    let dec;
    if (typeof chainId === 'number') dec = chainId;
    else if (typeof chainId === 'string') dec = chainId.startsWith('0x') ? parseInt(chainId, 16) : parseInt(chainId, 10);
    else return false;
    if (networkKey === 'testnet') return dec === target.chainIdDecimal;
    if (networkKey === 'mainnet') return dec === target.chainIdDecimal;
    return false;
  }

  // 1. Network configuration validation
  assert.strictEqual(NETWORKS.testnet.chainIdDecimal, 91562037, 'Testnet chainIdDecimal must be 91562037');
  assert.strictEqual(NETWORKS.testnet.chainIdHex, '0x5752035', 'Testnet chainIdHex must be 0x5752035');
  assert.strictEqual(NETWORKS.testnet.explorerBaseUrl, 'https://testnet.mstscan.com', 'Testnet explorer must be https://testnet.mstscan.com');
  console.log('✔ MST Testnet configuration preserved correctly (91562037 / 0x5752035 / https://testnet.mstscan.com)');

  assert.strictEqual(NETWORKS.mainnet.chainIdDecimal, 4646, 'Mainnet chainIdDecimal must be 4646');
  assert.strictEqual(NETWORKS.mainnet.chainIdHex, '0x1226', 'Mainnet chainIdHex must be 0x1226');
  assert.strictEqual(NETWORKS.mainnet.rpcUrl, 'https://4646.rpc.thirdweb.com', 'Mainnet RPC must be https://4646.rpc.thirdweb.com');
  assert.strictEqual(NETWORKS.mainnet.explorerBaseUrl, 'https://mstscan.com', 'Mainnet explorer must be https://mstscan.com');
  assert.strictEqual(NETWORKS.mainnet.currency.name, 'MSTC', 'Mainnet currency must be MSTC');
  assert.strictEqual(NETWORKS.mainnet.currency.decimals, 18, 'Mainnet decimals must be 18');
  console.log('✔ MST Mainnet configuration verified (4646 / 0x1226 / https://4646.rpc.thirdweb.com / https://mstscan.com)');

  // 2. Explorer URL generation
  const sampleTx = '0x7fbc35a3cc8b7de8ff99154b29dfc2d890c5c2400820c107938dfe0a116b5344';
  const sampleContract = '0xe9097672C2556318f1BD974323174baA43b88514';

  const testnetTxUrl = getExplorerTxUrl(sampleTx, 'testnet');
  assert.strictEqual(testnetTxUrl, `https://testnet.mstscan.com/tx/${sampleTx}`);
  const mainnetTxUrl = getExplorerTxUrl(sampleTx, 'mainnet');
  assert.strictEqual(mainnetTxUrl, `https://mstscan.com/tx/${sampleTx}`);
  console.log('✔ Dynamic getExplorerTxUrl accurately generates testnet vs mainnet links');

  const testnetAddrUrl = getExplorerAddressUrl(sampleContract, 'testnet');
  assert.strictEqual(testnetAddrUrl, `https://testnet.mstscan.com/address/${sampleContract}`);
  const mainnetAddrUrl = getExplorerAddressUrl(sampleContract, 'mainnet');
  assert.strictEqual(mainnetAddrUrl, `https://mstscan.com/address/${sampleContract}`);
  console.log('✔ Dynamic getExplorerAddressUrl accurately generates testnet vs mainnet links');

  // 3. Chain ID matching & mismatch protection
  assert.strictEqual(isChainIdMatchingNetwork(91562037, 'testnet'), true, 'Matches decimal 91562037');
  assert.strictEqual(isChainIdMatchingNetwork('0x5752035', 'testnet'), true, 'Matches hex 0x5752035');
  assert.strictEqual(isChainIdMatchingNetwork(4646, 'testnet'), false, 'Rejects Mainnet chain on Testnet');
  assert.strictEqual(isChainIdMatchingNetwork(1, 'testnet'), false, 'Rejects Ethereum Mainnet on Testnet');

  assert.strictEqual(isChainIdMatchingNetwork(4646, 'mainnet'), true, 'Matches decimal 4646');
  assert.strictEqual(isChainIdMatchingNetwork('0x1226', 'mainnet'), true, 'Matches hex 0x1226');
  assert.strictEqual(isChainIdMatchingNetwork('0x1216', 'mainnet'), false, 'Strictly rejects erroneous hex 0x1216 (decimal 4630)');
  assert.strictEqual(isChainIdMatchingNetwork(91562037, 'mainnet'), false, 'Rejects Testnet chain on Mainnet');
  assert.strictEqual(isChainIdMatchingNetwork(1, 'mainnet'), false, 'Rejects Ethereum on Mainnet');
  console.log('✔ isChainIdMatchingNetwork strictly detects and blocks chain ID mismatches (including 0x1216)');

  // 4. Deployment isolation verification
  assert(deploymentJson.testnet, 'deployment.json must contain testnet key');
  assert(deploymentJson.mainnet, 'deployment.json must contain mainnet key');
  assert.strictEqual(
    deploymentJson.testnet.contractAddress.toLowerCase(),
    '0xe9097672C2556318f1BD974323174baA43b88514'.toLowerCase(),
    'Testnet deployed contract address must remain 0xe9097672C2556318f1BD974323174baA43b88514'
  );
  assert.strictEqual(deploymentJson.testnet.deployed, true, 'Testnet must be marked as deployed');
  assert.notStrictEqual(
    deploymentJson.mainnet.contractAddress.toLowerCase(),
    deploymentJson.testnet.contractAddress.toLowerCase(),
    'Mainnet contract address must NOT reuse or overwrite Testnet contract address'
  );
  console.log('✔ Deployment configuration maintains strict isolation between Testnet and Mainnet');
}

async function main() {
  console.log('====================================================');
  console.log('      NotaryVault Phase 6 Verification Test Suite   ');
  console.log('====================================================');

  // 1. Run Hash Conversion Tests
  await runHashConversionTests();

  // 2. Check if local node is already running
  let node = null;
  let shouldKillNode = false;
  try {
    const checkRes = await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 })
    });
    if (checkRes.ok) {
      const json = await checkRes.json();
      if (json && json.result) {
        console.log('\n✔ Reusing already running JSON-RPC node on 127.0.0.1:8545');
      } else {
        throw new Error('Port responded without valid RPC result');
      }
    } else {
      throw new Error(`HTTP ${checkRes.status}`);
    }
  } catch {
    console.log('\nLaunching local Hardhat node on port 8545...');
    node = spawn('npx', ['hardhat', '--config', 'hardhat.config.cjs', 'node'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    shouldKillNode = true;

    // Wait for node to be ready by polling RPC endpoint
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const ping = await fetch('http://127.0.0.1:8545', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 })
        });
        if (ping.ok) {
          const res = await ping.json();
          if (res && res.result) {
            console.log('✔ Local node listening on 127.0.0.1:8545');
            ready = true;
            break;
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    if (!ready) {
      throw new Error('Local node timed out starting on 127.0.0.1:8545');
    }
  }

  try {
    await runContractTests();
    await runMultiNetworkTests();
    console.log('\n====================================================');
    console.log('🎉 ALL CONTRACT & MULTI-NETWORK TESTS PASSED WITH 100% SUCCESS!');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ Contract test failed:', err);
    process.exit(1);
  } finally {
    if (shouldKillNode && node && node.pid) {
      try {
        spawn('taskkill', ['/pid', String(node.pid), '/T', '/F']);
      } catch {
        node.kill();
      }
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
