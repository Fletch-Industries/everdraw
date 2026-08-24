import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useWallet } from '@/contexts/WalletContext';
import { IdentityCard } from '@bsv/identity-react';
import { artworkStore, ArtworkMetadata } from '@/lib/artworkStore';
import { Upload, Loader2, CheckCircle, AlertCircle, ExternalLink, Globe } from 'lucide-react';
import { toast } from 'sonner';

interface PublishToGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artworkBlob: Blob | null;
  artworkName: string;
  onPublishComplete?: (metadata: ArtworkMetadata) => void;
}

type PublishStep = 'form' | 'connecting' | 'uploading' | 'saving' | 'success' | 'error';

export function PublishToGalleryDialog({ 
  open, 
  onOpenChange, 
  artworkBlob, 
  artworkName,
  onPublishComplete 
}: PublishToGalleryDialogProps) {
  const { isConnected, isConnecting, publicKey, connect, error: walletError } = useWallet();
  
  const [step, setStep] = useState<PublishStep>('form');
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [artist, setArtist] = useState('');
  const [publishedMetadata, setPublishedMetadata] = useState<ArtworkMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setStep('connecting');
    const success = await connect();
    if (!success) {
      setStep('error');
      setError(walletError || 'Failed to connect wallet');
    } else {
      setStep('form');
    }
  };

  const uploadToUHRP = async (blob: Blob): Promise<string> => {
    const { StorageUploader, WalletClient } = await import('@bsv/sdk');
    
    const storageURL = 'https://nanostore.babbage.systems';
    const wallet = new WalletClient();
    const storageUploader = new StorageUploader({
      storageURL,
      wallet
    });

    const fileArrayBuffer = await blob.arrayBuffer();
    const data = Array.from(new Uint8Array(fileArrayBuffer));
    const uploadableFile = { data, size: data.length, type: blob.type };

    // 1 year retention
    const uploadResult = await storageUploader.publishFile({
      file: uploadableFile,
      retentionPeriod: 525600
    });

    return uploadResult.uhrpURL;
  };

  const handlePublish = useCallback(async () => {
    if (!artworkBlob || !title.trim()) return;
    
    setError(null);
    setProgress(0);
    
    try {
      // Step 1: Upload to UHRP
      setStep('uploading');
      
      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 70));
      }, 300);

      let imageId: string;
      try {
        imageId = await uploadToUHRP(artworkBlob);
      } finally {
        // A failed upload previously skipped clearInterval, leaving the
        // progress timer running forever behind the error screen.
        clearInterval(progressInterval);
      }
      setProgress(80);
      
      // Step 2: Save metadata to GlobalKVStore
      setStep('saving');
      
      const metadata: ArtworkMetadata = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: title.trim(),
        description: description.trim(),
        imageId,
        artist: artist.trim() || 'Unknown Artist',
        createdAt: new Date().toISOString(),
        tags: ['everdraw']
      };
      
      await artworkStore.saveArtwork(metadata);
      
      setProgress(100);
      setPublishedMetadata(metadata);
      setStep('success');
      
      onPublishComplete?.(metadata);
      toast.success('Artwork published to decentralized gallery!');
      
    } catch (err: unknown) {
      setStep('error');
      setError(err instanceof Error ? err.message : 'Failed to publish artwork');
    }
  }, [artworkBlob, title, description, artist, onPublishComplete]);

  const resetDialog = () => {
    setStep('form');
    setProgress(0);
    setTitle('');
    setDescription('');
    setArtist('');
    setPublishedMetadata(null);
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
            <Globe className="w-5 h-5" />
            Publish to Gallery
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
                    Install the Metanet Client to publish artwork to decentralized storage.
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
                Connect your wallet to publish artwork to decentralized storage.
                Your artwork will be permanently stored and accessible worldwide.
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
          
          {/* Connected - show form */}
          {isConnected && publicKey && step === 'form' && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">Publishing as:</p>
                <IdentityCard identityKey={publicKey} themeMode="dark" />
              </div>
              
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-medium">{artworkName}</p>
                <p className="text-xs text-muted-foreground">
                  {artworkBlob ? `${(artworkBlob.size / 1024).toFixed(1)} KB` : 'No artwork'}
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Artwork title"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="artist">Artist</Label>
                  <Input
                    id="artist"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your artwork..."
                    rows={3}
                  />
                </div>
              </div>
              
              <Button 
                onClick={handlePublish} 
                className="w-full" 
                disabled={!artworkBlob || !title.trim()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Publish to Gallery
              </Button>
              
              <p className="text-xs text-muted-foreground text-center">
                Storage is hosted for 1 year on UHRP decentralized network
              </p>
            </div>
          )}
          
          {/* Upload/Save progress */}
          {(step === 'uploading' || step === 'saving') && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {step === 'uploading' && 'Uploading to decentralized storage...'}
                    {step === 'saving' && 'Saving metadata to blockchain...'}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
              </div>
            </div>
          )}
          
          {/* Success */}
          {step === 'success' && publishedMetadata && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <div>
                    <p className="font-medium text-green-500">Published!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your artwork is now live on the decentralized gallery.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Title:</span>
                  <span className="font-medium">{publishedMetadata.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">UHRP URL:</span>
                  <span className="font-mono truncate max-w-[180px]">{publishedMetadata.imageId}</span>
                </div>
              </div>
              
              <Button className="w-full" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          )}
          
          {/* Error */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium text-red-500">Publishing Failed</p>
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
