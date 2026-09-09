import { Store, type StorageController } from './StorageController';

export type OfflineMediaEntry = {
    id: string;
    title: string;
    providerID: string;
    createdAt: number;
    blobs: string[]; // keys in DownloadedMedia store
};

/**
 * Helper for reading downloaded manga offline.
 * Promotes temporary blobs to persistent DownloadedMedia for offline access.
 */
export class OfflineReader {

    constructor(private readonly storage: StorageController) {}

    public async SaveOfflineMedia(entry: OfflineMediaEntry, blobs: Blob[]): Promise<void> {
        const keys: string[] = [];
        for (const blob of blobs) {
            const data = await blob.arrayBuffer();
            const key = `offline-${entry.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            await this.storage.SavePersistent(data, Store.DownloadedMedia, key);
            keys.push(key);
        }
        await this.storage.SavePersistent({ ...entry, blobs: keys }, Store.DownloadedMedia, entry.id);
    }

    public async LoadOfflineMedia(id: string): Promise<{ entry: OfflineMediaEntry, blobs: Blob[] } | undefined> {
        const entry = await this.storage.LoadPersistent<OfflineMediaEntry>(Store.DownloadedMedia, id);
        if (!entry) return undefined;
        const blobs: Blob[] = [];
        for (const key of entry.blobs) {
            const data = await this.storage.LoadPersistent<ArrayBuffer>(Store.DownloadedMedia, key);
            if (data) blobs.push(new Blob([data]));
        }
        return { entry, blobs };
    }

    public async ListOfflineMedia(): Promise<OfflineMediaEntry[]> {
        const all = await this.storage.LoadPersistent<OfflineMediaEntry[]>(Store.DownloadedMedia);
        return Array.isArray(all) ? all : [];
    }

    public async RemoveOfflineMedia(id: string): Promise<void> {
        const entry = await this.storage.LoadPersistent<OfflineMediaEntry>(Store.DownloadedMedia, id);
        if (entry?.blobs) {
            await this.storage.RemovePersistent(Store.DownloadedMedia, ...entry.blobs);
        }
        await this.storage.RemovePersistent(Store.DownloadedMedia, id);
    }

    public async IsAvailableOffline(id: string): Promise<boolean> {
        const entry = await this.storage.LoadPersistent<OfflineMediaEntry>(Store.DownloadedMedia, id);
        return !!entry;
    }
}
