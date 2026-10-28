import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contractPath = path.resolve(__dirname, '../contracts/NotaryVaultRegistry.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'NotaryVaultRegistry.sol': {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'],
      },
    },
  },
};

console.log('Compiling NotaryVaultRegistry.sol with solc...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

let hasErrors = false;
if (output.errors) {
  for (const error of output.errors) {
    if (error.severity === 'error') {
      console.error('Compilation Error:', error.formattedMessage);
      hasErrors = true;
    } else {
      console.warn('Warning:', error.formattedMessage);
    }
  }
}

if (hasErrors) {
  process.exit(1);
}

const contract = output.contracts['NotaryVaultRegistry.sol']['NotaryVaultRegistry'];
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

const outDir = path.resolve(__dirname, '../src/contracts');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const artifact = {
  contractName: 'NotaryVaultRegistry',
  compiler: 'solc ' + solc.version(),
  compiledAt: new Date().toISOString(),
  abi,
  bytecode: '0x' + bytecode,
};

fs.writeFileSync(
  path.join(outDir, 'NotaryVaultRegistry.json'),
  JSON.stringify(artifact, null, 2)
);

console.log('Successfully compiled NotaryVaultRegistry!');
console.log('Artifact saved to src/contracts/NotaryVaultRegistry.json');
console.log(`ABI methods count: ${abi.length}`);
console.log(`Bytecode length: ${bytecode.length} characters`);
