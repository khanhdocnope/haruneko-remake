import { Store, type StorageController } from '../../StorageController';
import type { ISyncProvider, SyncSnapshot } from './ISyncProvider';
import { GistSyncProvider } from './GistSyncProvider';
import { WebDAVSyncProvider } from './WebDAVSyncProvider';
import type { ISettings } from '../../SettingsManager';
import type { Choice, Secret, Text, Check } from '../../SettingsManager';

const SYNC_STORES: Store[] = [Store.Bookmarks, Store.Settings];
const SYNC_REVISION_KEY = 'hakuneko:sync:revision';
const SYNC_PENDING_KEY = 'hakuneko:sync:pending';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';
export type SyncResult = { pushed: boolean; pulled: boolean; conflicts: number };

export class SyncManager {

    private provider: ISyncProvider | null = null;
    private status: SyncStatus = 'idle';
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly debounceMs = 2000;
    private unwatch: (() => void) | undefined;

    constructor(
        private readonly storage: StorageController,
        private readonly settings: ISettings,
    ) {}

    private GetProviderFromSettings(): ISyncProvider | null {
        try {
            const providerId = this.settings.Get<Choice>('sync-provider')?.Value;
            if (providerId === 'gist') {
                const token = this.settings.Get<Secret>('sync-token')?.Value ?? '';
                return new GistSyncProvider({ token });
            }
            if (providerId === 'webdav') {
                const url = this.settings.Get<Text>('sync-webdav-url')?.Value ?? '';
                const user = this.settings.Get<Text>('sync-webdav-user')?.Value ?? '';
                const pass = this.settings.Get<Secret>('sync-webdav-pass')?.Value ?? '';
                return new WebDAVSyncProvider({ url, username: user, password: pass });
            }
        } catch { /* no provider configured */ }
        return null;
    }

    public async Initialize(): Promise<void> {
        this.provider = this.GetProviderFromSettings();

        // Watch storage changes to debounce push
        if (this.storage.Watch) {
            this.unwatch = this.storage.Watch((store) => {
                if ((SYNC_STORES as string[]).includes(store)) {
                    this.SchedulePush();
                }
            });
        }

        // Listen for SW background sync
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
                if (e.data?.type === 'SYNC_REQUESTED') this.Sync().catch(console.warn);
            });
        }
        window.addEventListener('online', () => this.Sync().catch(console.warn));

        // Initial pull if online and provider configured
        if (this.provider && navigator.onLine) {
            await this.Sync().catch(console.warn);
        }

        // React to settings changes (provider switch)
        try {
            this.settings.Get<Choice>('sync-provider')?.Subscribe(() => {
                this.provider = this.GetProviderFromSettings();
            });
        } catch { /* ignore */ }
    }

    public Destroy(): void {
        this.unwatch?.();
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
    }

    public GetStatus(): SyncStatus {
        return this.status;
    }

    private SchedulePush(): void {
        if (!this.provider) return;
        const auto = this.settings.Get<Check>('sync-auto')?.Value ?? true;
        if (!auto) {
            localStorage.setItem(SYNC_PENDING_KEY, '1');
            return;
        }
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.Sync().catch(console.warn), this.debounceMs);
    }

    public async Sync(): Promise<SyncResult> {
        if (!this.provider) return { pushed: false, pulled: false, conflicts: 0 };
        if (!navigator.onLine) {
            this.status = 'offline';
            this.TryRegisterBackgroundSync();
            return { pushed: false, pulled: false, conflicts: 0 };
        }
        this.status = 'syncing';
        try {
            const localSnapshot = await this.BuildLocalSnapshot();
            const remoteSnapshot = await this.provider.Pull();

            if (!remoteSnapshot) {
                await this.provider.Push(localSnapshot);
                this.SetLocalRevision(localSnapshot.revision);
                this.status = 'idle';
                return { pushed: true, pulled: false, conflicts: 0 };
            }

            const localRev = this.GetLocalRevision();
            let conflicts = 0;

            // Remote newer → merge into local
            if (remoteSnapshot.revision > localRev) {
                conflicts = await this.MergeRemoteToLocal(remoteSnapshot, localSnapshot);
                this.SetLocalRevision(remoteSnapshot.revision);
            }

            // Local has newer changes → push
            const newLocal = await this.BuildLocalSnapshot();
            if (newLocal.revision > remoteSnapshot.revision || conflicts > 0 || localStorage.getItem(SYNC_PENDING_KEY)) {
                newLocal.revision = Math.max(newLocal.revision, remoteSnapshot.revision) + 1;
                newLocal.timestamp = Date.now();
                await this.provider.Push(newLocal);
                this.SetLocalRevision(newLocal.revision);
                localStorage.removeItem(SYNC_PENDING_KEY);
                this.status = 'idle';
                return { pushed: true, pulled: conflicts > 0, conflicts };
            }

            this.status = 'idle';
            return { pushed: false, pulled: conflicts > 0, conflicts };
        } catch (e) {
            this.status = 'error';
            console.warn('[Sync] failed', e);
            return { pushed: false, pulled: false, conflicts: 0 };
        }
    }

    private async BuildLocalSnapshot(): Promise<SyncSnapshot> {
        const stores: Partial<Record<Store, unknown>> = {};
        for (const store of SYNC_STORES) {
            const data = await this.storage.LoadPersistent<unknown>(store);
            if (data !== undefined) stores[store] = data;
        }
        const rev = this.GetLocalRevision() + 1;
        return { revision: rev, timestamp: Date.now(), stores, version: 1 };
    }

    private GetLocalRevision(): number {
        return parseInt(localStorage.getItem(SYNC_REVISION_KEY) ?? '0', 10) || 0;
    }

    private SetLocalRevision(rev: number): void {
        localStorage.setItem(SYNC_REVISION_KEY, String(rev));
    }

    /**
     * Merge remote snapshot into local storage.
     * Strategy: last-write-wins per store key; Bookmarks deduplicated by StorageKey.
     */
    private async MergeRemoteToLocal(remote: SyncSnapshot, _local: SyncSnapshot): Promise<number> {
        let conflicts = 0;
        for (const store of SYNC_STORES) {
            const remoteData = remote.stores[store];
            if (remoteData === undefined) continue;

            if (store === Store.Bookmarks) {
                const remoteArr = Array.isArray(remoteData) ? remoteData as unknown[] : [];
                const localArr = await this.storage.LoadPersistent<unknown[]>(store) ?? [];
                const merged = this.MergeBookmarks(localArr, remoteArr);
                conflicts += merged.conflicts;
                await this.storage.SavePersistent(merged.result, store);
            } else {
                // Settings: per-key last-write-wins (remote wins if newer timestamp)
                // For v1: remote overwrites local entirely when remote is newer
                await this.storage.SavePersistent(remoteData, store);
                conflicts++;
            }
        }
        return conflicts;
    }

    private MergeBookmarks(local: unknown[], remote: unknown[]): { result: unknown[]; conflicts: number } {
        const keyOf = (e: unknown) => (e as { StorageKey?: string; Media?: { ProviderID: string; EntryID: string } })?.StorageKey
            ?? `${(e as { Media?: { ProviderID: string; EntryID: string } })?.Media?.ProviderID}:${(e as { Media?: { ProviderID: string; EntryID: string } })?.Media?.EntryID}`;
        const map = new Map<string, unknown>();
        for (const e of local) map.set(keyOf(e), e);
        let conflicts = 0;
        for (const e of remote) {
            const k = keyOf(e);
            if (!map.has(k)) map.set(k, e);
            else conflicts++;
        }
        return { result: [...map.values()], conflicts };
    }

    private TryRegisterBackgroundSync(): void {
        try {
            const reg = (navigator.serviceWorker as unknown as { ready: Promise<ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }> }).ready;
            reg.then(r => r.sync?.register('hakuneko-sync').catch(() => {})).catch(() => {});
        } catch { /* ignore */ }
    }

    public async ForcePush(): Promise<void> {
        const snap = await this.BuildLocalSnapshot();
        if (!this.provider) throw new Error('No sync provider configured');
        await this.provider.Push(snap);
        this.SetLocalRevision(snap.revision);
    }

    public async ForcePull(): Promise<void> {
        if (!this.provider) throw new Error('No sync provider configured');
        const remote = await this.provider.Pull();
        if (remote) {
            const local = await this.BuildLocalSnapshot();
            await this.MergeRemoteToLocal(remote, local);
            this.SetLocalRevision(remote.revision);
        }
    }
}
