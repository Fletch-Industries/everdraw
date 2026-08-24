import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { artworkStore, ArtworkMetadata } from '@/lib/artworkStore';
import { Brush, Globe, ArrowLeft, RefreshCw, User, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Img } from '@bsv/uhrp-react';
const PublicGallery = () => {
  const [artworks, setArtworks] = useState<ArtworkMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkMetadata | null>(null);
  const loadArtworks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await artworkStore.getAllArtworks();
      setArtworks(data);
    } catch (err: unknown) {
      console.error('Error loading artworks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load artworks');
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    loadArtworks();
  }, []);
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  return <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <h1 className="font-semibold text-lg">Public Gallery</h1>
                <p className="text-xs text-muted-foreground">Decentralized artwork on UHRP</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={loadArtworks} disabled={isLoading} title="Refresh">
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Link to="/">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  My Gallery
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Gallery type tabs */}
          <div className="flex gap-2 mt-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <Brush className="w-4 h-4" />
                Local
              </Button>
            </Link>
            <Button variant="secondary" size="sm" className="gap-2">
              <Globe className="w-4 h-4" />
              Public
              <Badge variant="outline" className="ml-1 text-xs bg-cyan-500/10 text-cyan-500 border-cyan-500/30">
                UHRP
              </Badge>
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Info banner */}
        <div className="mb-6 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex items-start gap-3">
            <Globe className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-cyan-500">Decentralized Storage</p>
              <p className="text-xs text-muted-foreground mt-1">These artworks are stored and retrieved using a hashed-based content delivery network (UHRP).</p>
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 mb-6">
            <p className="text-sm text-red-500">{error}</p>
            <Button variant="outline" size="sm" onClick={loadArtworks} className="mt-2">
              Try Again
            </Button>
          </div>}

        {/* Loading state */}
        {isLoading && <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-square w-full" />
                <CardContent className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>)}
          </div>}

        {/* Artworks grid */}
        {!isLoading && artworks.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {artworks.map(artwork => <Card key={artwork.id} className="group overflow-hidden hover:border-cyan-500/50 transition-colors cursor-pointer" onClick={() => setSelectedArtwork(artwork)}>
                <div className="aspect-square relative bg-muted overflow-hidden">
                  {/* UHRP Image */}
                  <Img src={artwork.imageId} alt={artwork.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" fallback={<div className="absolute inset-0 bg-muted flex items-center justify-center">
                        <div className="text-center p-4">
                          <Globe className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">Loading...</p>
                        </div>
                      </div>} />
                  
                  {/* UHRP badge */}
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="bg-black/60 text-white border-0 text-xs backdrop-blur-sm">
                      <Globe className="w-3 h-3 mr-1" />
                      UHRP
                    </Badge>
                  </div>
                </div>
                
                <CardContent className="p-3 space-y-2">
                  <h3 className="font-medium text-sm truncate">{artwork.title}</h3>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span className="truncate">{artwork.artist}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(artwork.createdAt)}</span>
                  </div>
                  
                  {artwork.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {artwork.description}
                    </p>}
                </CardContent>
              </Card>)}
          </div>}

        {/* Artwork Modal */}
        <Dialog open={!!selectedArtwork} onOpenChange={open => !open && setSelectedArtwork(null)}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-0 overflow-hidden bg-black/95 border-border [&>button]:top-4 [&>button]:right-4 [&>button]:text-white [&>button]:opacity-70 [&>button]:hover:opacity-100">
            
            {selectedArtwork && <div className="flex flex-col h-full max-h-[90vh]">
                <div className="flex-1 flex items-center justify-center p-4 min-h-0">
                  <Img src={selectedArtwork.imageId} alt={selectedArtwork.title} className="max-w-full max-h-[70vh] object-contain" fallback={<div className="w-64 h-64 bg-muted flex items-center justify-center rounded-lg">
                        <div className="text-center p-4">
                          <Globe className="w-12 h-12 text-muted-foreground/50 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Loading...</p>
                        </div>
                      </div>} />
                </div>
                
                <div className="p-4 bg-background/80 backdrop-blur-sm border-t border-border">
                  <h2 className="font-semibold text-lg">{selectedArtwork.title}</h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      <span>{selectedArtwork.artist}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(selectedArtwork.createdAt)}</span>
                    </div>
                  </div>
                  {selectedArtwork.description && <p className="text-sm text-muted-foreground mt-2">{selectedArtwork.description}</p>}
                </div>
              </div>}
          </DialogContent>
        </Dialog>

        {/* Empty state */}
        {!isLoading && !error && artworks.length === 0 && <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-2">No Published Artworks</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              No artworks have been published to the decentralized gallery yet. 
              Create artwork in Everdraw and use "Publish to Gallery" after exporting.
            </p>
            <Link to="/">
              <Button variant="outline" className="mt-4 gap-2">
                <Brush className="w-4 h-4" />
                Go to My Gallery
              </Button>
            </Link>
          </div>}
      </main>
    </div>;
};
export default PublicGallery;
