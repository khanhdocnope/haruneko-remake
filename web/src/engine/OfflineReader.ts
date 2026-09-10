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
            const mime = blob.type || 'image/jpeg';
            const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const key = `offline-${entry.id}-${uuid}`;
            await this.storage.SavePersistent({ data, mime }, Store.DownloadedMedia, key);
            keys.push(key);
        }
        await this.storage.SavePersistent({ ...entry, blobs: keys }, Store.DownloadedMedia, entry.id);
    }

    public async LoadOfflineMedia(id: string): Promise<{ entry: OfflineMediaEntry, blobs: Blob[] } | undefined> {
        const entry = await this.storage.LoadPersistent<OfflineMediaEntry>(Store.DownloadedMedia, id);
        if (!entry) return undefined;
        const blobs: Blob[] = [];
        for (const key of entry.blobs) {
            const stored = await this.storage.LoadPersistent<{ data: ArrayBuffer; mime: string } | ArrayBuffer>(Store.DownloadedMedia, key);
            if (stored) {
                if (stored instanceof ArrayBuffer) blobs.push(new Blob([stored]));
                else if ((stored as { data: ArrayBuffer }).data) blobs.push(new Blob([(stored as { data: ArrayBuffer }).data], { type: (stored as { mime: string }).mime }));
            }
        }
        return { entry, blobs };
    }

    public async ListOfflineMedia(): Promise<OfflineMediaEntry[]> {
        const all = await this.storage.LoadPersistent<Record<string, OfflineMediaEntry>>(Store.DownloadedMedia);
        if (!all || typeof all !== 'object') return [];
        return Object.values(all).filter(v => v && typeof v === 'object' && 'id' in v) as OfflineMediaEntry[];
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
