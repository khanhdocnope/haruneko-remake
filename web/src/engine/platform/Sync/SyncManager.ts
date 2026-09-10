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

    private RefreshProvider(): void {
        this.provider = this.GetProviderFromSettings();
    }

    private OnOnline = () => this.Sync().catch(console.warn);
    private OnMessage = (e: MessageEvent) => {
        if (e.data?.type === 'SYNC_REQUESTED') this.Sync().catch(console.warn);
    };

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
            navigator.serviceWorker.removeEventListener('message', this.OnMessage as EventListener);
            navigator.serviceWorker.addEventListener('message', this.OnMessage as EventListener);
        }
        window.removeEventListener('online', this.OnOnline);
        window.addEventListener('online', this.OnOnline);

        // Initial pull if online and provider configured
        if (this.provider && navigator.onLine) {
            await this.Sync().catch(console.warn);
        }

        // React to settings changes (provider + creds)
        try {
            const refresh = () => this.RefreshProvider();
            this.settings.Get<Choice>('sync-provider')?.Subscribe(refresh);
            this.settings.Get<Secret>('sync-token')?.Subscribe(refresh);
            this.settings.Get<Text>('sync-webdav-url')?.Subscribe(refresh);
            this.settings.Get<Text>('sync-webdav-user')?.Subscribe(refresh);
            this.settings.Get<Secret>('sync-webdav-pass')?.Subscribe(refresh);
        } catch { /* ignore */ }
    }

    public Destroy(): void {
        this.unwatch?.();
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', this.OnMessage as EventListener);
        window.removeEventListener('online', this.OnOnline);
    }

    public GetStatus(): SyncStatus {
        return this.status;
    }

    private SchedulePush(): void {
        if (!this.provider) return;
        let auto = true;
        try { auto = this.settings.Get<Check>('sync-auto')?.Value ?? true; } catch { /* ignore */ }
        if (!auto) {
            try { localStorage.setItem(SYNC_PENDING_KEY, '1'); } catch { /* ignore */ }
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
            let pulled = false;

            // Remote newer → merge into local
            if (remoteSnapshot.revision > localRev) {
                conflicts = await this.MergeRemoteToLocal(remoteSnapshot, localSnapshot);
                this.SetLocalRevision(remoteSnapshot.revision);
                pulled = true;
            }

            // Check if local has pending changes (compare stored revision vs remote)
            const pendingKey = (() => { try { return localStorage.getItem(SYNC_PENDING_KEY); } catch { return null; } })();
            const hasLocalChanges = localSnapshot.revision > remoteSnapshot.revision;
            if (hasLocalChanges || pulled || pendingKey) {
                // Rebuild only if we pulled (to include merged data), otherwise reuse localSnapshot
                const toPush = pulled ? await this.BuildLocalSnapshot() : localSnapshot;
                toPush.revision = Math.max(toPush.revision, remoteSnapshot.revision) + 1;
                toPush.timestamp = Date.now();
                await this.provider.Push(toPush);
                this.SetLocalRevision(toPush.revision);
                try { localStorage.removeItem(SYNC_PENDING_KEY); } catch { /* ignore */ }
                this.status = 'idle';
                return { pushed: true, pulled, conflicts };
            }

            this.status = 'idle';
            return { pushed: false, pulled, conflicts };
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
        try { return parseInt(localStorage.getItem(SYNC_REVISION_KEY) ?? '0', 10) || 0; } catch { return 0; }
    }

    private SetLocalRevision(rev: number): void {
        try { localStorage.setItem(SYNC_REVISION_KEY, String(rev)); } catch { /* ignore */ }
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
        const keyOf = (e: unknown) => {
            const sk = (e as { StorageKey?: string })?.StorageKey;
            if (sk) return sk;
            const m = (e as { Media?: { ProviderID: string; EntryID: string } })?.Media;
            if (m?.ProviderID && m?.EntryID) return `${m.ProviderID}:${m.EntryID}`;
            return `invalid:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
        };
        const map = new Map<string, unknown>();
        for (const e of local) {
            const k = keyOf(e);
            if (!k.startsWith('invalid:')) map.set(k, e);
        }
        let conflicts = 0;
        for (const e of remote) {
            const k = keyOf(e);
            if (k.startsWith('invalid:')) continue;
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
