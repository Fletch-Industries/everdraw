// Protocol ID - must use letters, numbers, and spaces only
const ARTWORK_PROTOCOL_ID: [0 | 1 | 2, string] = [1, 'everdraw gallery'];

// Configuration
const SERVICE_NAME = 'ls_kvstore';
const TOPICS = ['tm_kvstore'];
const NETWORK_PRESET = 'mainnet' as const;

export interface ArtworkMetadata {
  id: string;
  title: string;
  description: string;
  imageId: string;        // UHRP URL for the artwork image
  thumbnailId?: string;   // Optional UHRP URL for thumbnail
  artist: string;
  createdAt: string;
  tags?: string[];
}

// Lazy-loaded SDK modules (prevents React context errors)
let GlobalKVStore: any;
let WalletClient: any;

async function loadSDK() {
  if (!GlobalKVStore || !WalletClient) {
    const sdk = await import('@bsv/sdk');
    GlobalKVStore = sdk.GlobalKVStore;
    WalletClient = sdk.WalletClient;
  }
}

class ArtworkStore {
  private kv: any = null;
  private wallet: any = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await loadSDK();

      this.wallet = new WalletClient();

      this.kv = new GlobalKVStore({
        wallet: this.wallet,
        protocolID: ARTWORK_PROTOCOL_ID,
        serviceName: SERVICE_NAME,
        topics: TOPICS,
        networkPreset: NETWORK_PRESET,
        tokenSetDescription: 'Artwork metadata entry',
        tokenUpdateDescription: 'Updated artwork metadata',
        tokenRemovalDescription: 'Removed artwork entry'
      });

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize ArtworkStore:', error);
      throw error;
    }
  }

  async saveArtwork(metadata: ArtworkMetadata): Promise<string> {
    await this.initialize();
    if (!this.kv) throw new Error('ArtworkStore not initialized');

    const key = `artwork_${metadata.id}`;
    const value = JSON.stringify(metadata);
    const tags = ['artwork', 'gallery', ...(metadata.tags || [])];

    const outpoint = await this.kv.set(key, value, { tags });
    return outpoint;
  }

  async getArtwork(artworkId: string): Promise<ArtworkMetadata | null> {
    await this.initialize();
    if (!this.kv) throw new Error('ArtworkStore not initialized');

    try {
      const key = `artwork_${artworkId}`;
      const result = await this.kv.get({ key });

      if (!result) return null;

      // Handle both array and single-item responses
      const entries = Array.isArray(result) ? result : [result];

      for (const entry of entries) {
        if (entry && entry.value) {
          return JSON.parse(entry.value) as ArtworkMetadata;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting artwork:', error);
      return null;
    }
  }

  async getAllArtworks(): Promise<ArtworkMetadata[]> {
    await this.initialize();
    if (!this.kv) throw new Error('ArtworkStore not initialized');

    try {
      const results = await this.kv.get({ tags: ['artwork'] });

      if (!results) return [];

      const entries = Array.isArray(results) ? results : [results];

      const artworks: ArtworkMetadata[] = [];
      for (const entry of entries) {
        if (entry && entry.value) {
          try {
            const metadata = JSON.parse(entry.value) as ArtworkMetadata;
            artworks.push(metadata);
          } catch (parseError) {
            console.error('Error parsing artwork metadata:', parseError);
          }
        }
      }

      // Sort by creation time, newest first
      artworks.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return artworks;
    } catch (error) {
      console.error('Error getting all artworks:', error);
      return [];
    }
  }

  async removeArtwork(artworkId: string): Promise<boolean> {
    await this.initialize();
    if (!this.kv) throw new Error('ArtworkStore not initialized');

    try {
      const key = `artwork_${artworkId}`;
      await this.kv.remove(key);
      return true;
    } catch (error) {
      console.error('Error removing artwork:', error);
      return false;
    }
  }
}

// Export singleton instance
export const artworkStore = new ArtworkStore();
