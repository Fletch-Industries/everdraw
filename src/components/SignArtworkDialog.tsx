import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useWallet } from '@/contexts/WalletContext';
import { IdentityCard } from '@bsv/identity-react';
import { Signature, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SignArtworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artworkBlob: Blob | null;
  artworkName: string;
  onSignComplete?: (txid: string, contentHash: string) => void;
}

type SigningStep = 'idle' | 'connecting' | 'hashing' | 'signing' | 'publishing' | 'success' | 'error';

export function SignArtworkDialog({ open, onOpenChange, artworkBlob, artworkName, onSignComplete }: SignArtworkDialogProps) {
  const { isConnected, isConnecting, publicKey, client, connect, error: walletError } = useWallet();
  
  const [step, setStep] = useState<SigningStep>('idle');
  const [progress, setProgress] = useState(0);
  const [proof, setProof] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setStep('connecting');
    const success = await connect();
    if (!success) {
      setStep('error');
      setError(walletError || 'Failed to connect wallet');
    } else {
      setStep('idle');
    }
  };

  const handleSign = useCallback(async () => {
    if (!client || !artworkBlob) return;
    
    setError(null);
    setProgress(0);
    
    try {
      setStep('hashing');
      
      const file = new File([artworkBlob], artworkName, { type: artworkBlob.type });
      
      const signedProof = await client.signAndPublish(file, {
        onProgress: (p: { percent: number }) => {
          if (p.percent < 100) {
            setStep('hashing');
          } else {
            setStep('publishing');
          }
          setProgress(p.percent);
        }
      });
      
      setProof(signedProof);
      setStep('success');
      
      // Extract txid and notify parent
      const txid = signedProof.onChain?.outpoint?.includes(':')
        ? signedProof.onChain.outpoint.split(':')[0]
        : signedProof.onChain?.outpoint;
      if (txid && signedProof.contentHash) {
        onSignComplete?.(txid, signedProof.contentHash);
      }
      
      toast.success('Artwork signed and published on-chain!');
      
    } catch (err: any) {
      setStep('error');
      setError(err?.message || 'Failed to sign artwork');
    }
  }, [client, artworkBlob, artworkName]);

  const handleOpenTransaction = () => {
    if (proof?.onChain?.outpoint) {
      // Extract just the txid (remove :outputIndex suffix if present)
      const txid = proof.onChain.outpoint.includes(':') 
        ? proof.onChain.outpoint.split(':')[0] 
        : proof.onChain.outpoint;
      window.open(`https://whatsonchain.com/tx/${txid}`, '_blank');
    }
  };

  const resetDialog = () => {
    setStep('idle');
    setProgress(0);
    setProof(null);
    setError(null);
  };

  const showWalletNotInstalled = walletError === 'wallet_not_installed';

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetDialog();
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Signature className="w-5 h-5" />
            Sign Artwork
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Wallet not installed */}
          {showWalletNotInstalled && (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-500">Wallet Required</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Install the Metanet Client to sign your artwork with blockchain-backed proof.
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.open('https://getmetanet.com', '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Get Metanet Client
              </Button>
            </div>
          )}
          
          {/* Not connected */}
          {!isConnected && !showWalletNotInstalled && step !== 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your wallet to sign this artwork with your identity. 
                This creates permanent, verifiable proof of authorship on the blockchain.
              </p>
              <Button 
                onClick={handleConnect} 
                className="w-full"
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect Wallet'
                )}
              </Button>
            </div>
          )}
          
          {/* Connected - show identity and sign button */}
          {isConnected && publicKey && step === 'idle' && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">Signing as:</p>
                <IdentityCard identityKey={publicKey} themeMode="dark" />
              </div>
              
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-medium">{artworkName}</p>
                <p className="text-xs text-muted-foreground">
                  {artworkBlob ? `${(artworkBlob.size / 1024).toFixed(1)} KB` : 'No artwork'}
                </p>
              </div>
              
              <Button onClick={handleSign} className="w-full" disabled={!artworkBlob}>
                <Signature className="w-4 h-4 mr-2" />
                Sign & Publish
              </Button>
            </div>
          )}
          
          {/* Signing progress */}
          {(step === 'hashing' || step === 'signing' || step === 'publishing') && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {step === 'hashing' && 'Hashing artwork...'}
                    {step === 'signing' && 'Signing...'}
                    {step === 'publishing' && 'Publishing to blockchain...'}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
              </div>
            </div>
          )}
          
          {/* Success */}
          {step === 'success' && proof && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <div>
                    <p className="font-medium text-green-500">Signed & Published!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your artwork is now permanently recorded on the blockchain.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Content Hash:</span>
                  <span className="font-mono truncate max-w-[180px]">{proof.contentHash}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction:</span>
                  <span className="font-mono truncate max-w-[180px]">{proof.onChain?.outpoint}</span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleOpenTransaction}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on Chain
                </Button>
                <Button className="flex-1" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}
          
          {/* Error */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium text-red-500">Signing Failed</p>
                    <p className="text-xs text-muted-foreground mt-1">{error}</p>
                  </div>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={resetDialog}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
