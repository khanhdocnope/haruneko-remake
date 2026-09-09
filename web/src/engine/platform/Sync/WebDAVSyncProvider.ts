import type { ISyncProvider, SyncSnapshot } from './ISyncProvider';

export type WebDAVSyncOptions = {
    url: string; // e.g. https://example.com/dav/hakuneko-sync.json
    username?: string;
    password?: string;
};

/**
 * Sync via generic WebDAV (PUT/GET).
 * Any WebDAV-capable storage (Nextcloud, ownCloud, nginx dav).
 */
export class WebDAVSyncProvider implements ISyncProvider {

    public readonly id = 'webdav';
    public readonly label = 'WebDAV';

    constructor(private readonly options: WebDAVSyncOptions) {}

    private get Headers(): Record<string, string> {
        const h: Record<string, string> = {};
        if (this.options.username && this.options.password) {
            h['Authorization'] = `Basic ${btoa(`${this.options.username}:${this.options.password}`)}`;
        }
        return h;
    }

    public async Test(): Promise<boolean> {
        if (!this.options.url) return false;
        try {
            const res = await fetch(this.options.url, { method: 'HEAD', headers: this.Headers });
            // 404 is also reachable (empty yet)
            return res.ok || res.status === 404;
        } catch {
            return false;
        }
    }

    public async Pull(): Promise<SyncSnapshot | null> {
        const res = await fetch(this.options.url, { headers: this.Headers });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`WebDAV pull failed: ${res.status}`);
        try {
            return await res.json() as SyncSnapshot;
        } catch {
            return null;
        }
    }

    public async Push(snapshot: SyncSnapshot): Promise<void> {
        const res = await fetch(this.options.url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...this.Headers },
            body: JSON.stringify(snapshot, null, 2),
        });
        if (!res.ok) throw new Error(`WebDAV push failed: ${res.status} ${await res.text()}`);
    }
}
