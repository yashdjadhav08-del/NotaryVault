import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useWallet } from '../../context/WalletContext';
import { 
  deployMainnetContract, 
  estimateMainnetDeploymentGas, 
  getExplorerTxUrl, 
  getExplorerAddressUrl,
  type DeploymentGasEstimate,
  type MainnetDeploymentResult
} from '../../services/contractService';
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink, 
  Copy, 
  Check, 
  Loader2,
  RefreshCw,
  Fuel
} from 'lucide-react';

interface DeployMainnetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: MainnetDeploymentResult) => void;
}

export const DeployMainnetModal: React.FC<DeployMainnetModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { 
    address, 
    provider, 
    refreshContractConfig 
  } = useWallet();

  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<string>('');
  const [gasEstimate, setGasEstimate] = useState<DeploymentGasEstimate | null>(null);
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<MainnetDeploymentResult | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);

  // Fetch gas estimate when modal opens
  useEffect(() => {
    let isMounted = true;
    if (isOpen && provider && !deploymentResult) {
      setIsEstimatingGas(true);
      estimateMainnetDeploymentGas(provider)
        .then(est => {
          if (isMounted) setGasEstimate(est);
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setIsEstimatingGas(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, provider, deploymentResult]);

  const handleCopy = (text: string, type: 'address' | 'tx') => {
    navigator.clipboard.writeText(text);
    if (type === 'address') {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } else {
      setCopiedTx(true);
      setTimeout(() => setCopiedTx(false), 2000);
    }
  };

  const handleExecuteDeployment = async () => {
    if (isDeploying) return; // Prevent duplicate clicks
    if (!hasAcknowledged) return;

    setIsDeploying(true);
    setDeploymentError(null);
    setDeploymentStatus('Initiating deployment request in your connected wallet...');

    try {
      const result = await deployMainnetContract(provider, (statusText) => {
        setDeploymentStatus(statusText);
      });

      if (!result.success) {
        throw new Error(result.error || 'Mainnet contract deployment could not be verified.');
      }

      setDeploymentResult(result);
      refreshContractConfig();
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Deployment transaction failed on MST Chain Mainnet.';
      setDeploymentError(errMsg);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleClose = () => {
    if (isDeploying) return; // Prevent closing mid-flight
    if (deploymentResult) {
      refreshContractConfig();
    }
    setDeploymentError(null);
    setDeploymentStatus('');
    setHasAcknowledged(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Deploy Mainnet Smart Contract"
      subtitle="Deploy the official NotaryVaultRegistry smart contract to MST Chain Mainnet."
      maxWidth="lg"
    >
      <div className="space-y-5">
        
        {/* State 1: Success confirmation */}
        {deploymentResult && (
          <div className="space-y-5">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3.5 text-xs text-emerald-950">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-emerald-900">
                  NotaryVaultRegistry Deployed & Verified on Mainnet!
                </div>
                <p className="text-emerald-800 leading-relaxed">
                  The smart contract has been successfully deployed to MST Chain Mainnet (Chain ID 4646). On-chain bytecode, deployer authority, and registry interfaces have been verified.
                </p>
              </div>
            </div>

            <div className="space-y-3 p-4 bg-stone-50 border border-black/5 rounded-2xl font-mono text-xs">
              <div className="flex items-center justify-between text-stone-600 pb-2 border-b border-black/5 font-sans">
                <span className="font-semibold">Network</span>
                <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  MST Chain Mainnet (4646 / 0x1226)
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-sans text-stone-500 block mb-1">
                  Deployed Contract Address
                </span>
                <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-black/10 text-stone-900 break-all gap-2">
                  <span className="font-bold text-emerald-800">{deploymentResult.contractAddress}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(deploymentResult.contractAddress || '', 'address')}
                      className="p-1 hover:bg-stone-100 rounded text-stone-500 cursor-pointer"
                      title="Copy Address"
                    >
                      {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <a
                      href={getExplorerAddressUrl(deploymentResult.contractAddress || '', 'mainnet')}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:bg-stone-100 rounded text-purple-600 inline-flex items-center"
                      title="View on MSTScan Mainnet"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-sans text-stone-500 block mb-1">
                  Deployment Transaction Hash
                </span>
                <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-black/10 text-stone-900 break-all gap-2">
                  <span className="text-stone-700">{deploymentResult.txHash}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(deploymentResult.txHash || '', 'tx')}
                      className="p-1 hover:bg-stone-100 rounded text-stone-500 cursor-pointer"
                      title="Copy Tx Hash"
                    >
                      {copiedTx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <a
                      href={getExplorerTxUrl(deploymentResult.txHash || '', 'mainnet')}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:bg-stone-100 rounded text-purple-600 inline-flex items-center"
                      title="View on MSTScan Mainnet"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              {deploymentResult.blockNumber && (
                <div className="flex items-center justify-between text-stone-600 pt-1">
                  <span className="font-sans">Mined at Block</span>
                  <span className="font-bold text-stone-900">#{deploymentResult.blockNumber}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary-app"
                size="md"
                onClick={handleClose}
              >
                Done (Return to App)
              </Button>
            </div>
          </div>
        )}

        {/* State 2: Active Deployment in progress */}
        {isDeploying && !deploymentResult && (
          <div className="py-8 px-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto border border-purple-200">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-[#1C1C1C]">Deploying to MST Chain Mainnet</h4>
              <p className="text-xs text-stone-600 font-mono max-w-md mx-auto break-words leading-relaxed">
                {deploymentStatus || 'Communicating with wallet provider...'}
              </p>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 max-w-md mx-auto text-left flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Please do not close or reload this window until the transaction is mined on MST Chain Mainnet and the contract bytecode is verified.
              </span>
            </div>
          </div>
        )}

        {/* State 3: Pre-deployment confirmation */}
        {!isDeploying && !deploymentResult && (
          <div className="space-y-5">
            {/* Warning banner */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-950">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-amber-900 flex items-center gap-2">
                  <span>Mainnet Deployment Notice</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                    Live Network
                  </span>
                </div>
                <p className="text-stone-700 leading-relaxed">
                  You are about to deploy the <strong>NotaryVaultRegistry</strong> smart contract to <strong>MST Chain Mainnet</strong>. This transaction broadcasts to the live public blockchain, creates a permanent immutable registry, and permanently consumes real MSTC tokens from your connected wallet for deployment gas fees.
                </p>
              </div>
            </div>

            {/* Error display if previous attempt failed */}
            {deploymentError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs text-red-900">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold">Deployment Aborted</div>
                  <p className="text-red-800 leading-relaxed">{deploymentError}</p>
                </div>
              </div>
            )}

            {/* Deployment Specifications Table */}
            <div className="border border-black/10 rounded-2xl divide-y divide-black/[0.06] overflow-hidden text-xs">
              <div className="p-3.5 bg-stone-50 flex items-center justify-between">
                <span className="font-medium text-stone-500">Target Network</span>
                <span className="font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  MST Chain Mainnet
                </span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <span className="font-medium text-stone-500">Chain ID</span>
                <span className="font-mono font-semibold text-stone-800">4646 (0x1226)</span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <span className="font-medium text-stone-500">Contract Artifact</span>
                <span className="font-mono font-semibold text-stone-800">NotaryVaultRegistry (v1.0.0)</span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <span className="font-medium text-stone-500">Deployer & Initial Super Author</span>
                <span className="font-mono font-semibold text-emerald-800 break-all text-[11px]">
                  {address || 'Not Connected'}
                </span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <span className="font-medium text-stone-500 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-stone-400" />
                  <span>Estimated Deployment Gas</span>
                </span>
                <span className="font-mono text-stone-800">
                  {isEstimatingGas ? (
                    <span className="text-stone-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Estimating...
                    </span>
                  ) : gasEstimate ? (
                    <span>~{gasEstimate.estimatedCostFormatted} MSTC</span>
                  ) : (
                    <span>~0.0035 MSTC</span>
                  )}
                </span>
              </div>
            </div>

            {/* Explicit Confirmation Checkbox */}
            <label className="flex items-start gap-3 p-3.5 bg-stone-50 border border-black/10 rounded-xl cursor-pointer hover:bg-stone-100/70 transition-colors">
              <input
                type="checkbox"
                checked={hasAcknowledged}
                onChange={(e) => setHasAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-blue-600 border-stone-300 focus:ring-blue-500"
              />
              <span className="text-xs text-stone-700 leading-snug">
                I am the authorized Super Author. I explicitly confirm deploying <strong>NotaryVaultRegistry</strong> to MST Chain Mainnet and authorize spending real MSTC gas fees from my connected wallet.
              </span>
            </label>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={handleClose}
                disabled={isDeploying}
              >
                Cancel
              </Button>
              <Button
                variant="primary-app"
                size="md"
                disabled={!hasAcknowledged || isDeploying}
                onClick={handleExecuteDeployment}
                icon={<ShieldCheck className="w-4 h-4" />}
              >
                Deploy Mainnet Contract
              </Button>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
};
