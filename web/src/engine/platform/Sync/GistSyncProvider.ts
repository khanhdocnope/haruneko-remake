import type { ISyncProvider, SyncSnapshot } from './ISyncProvider';

const GIST_FILENAME = 'hakuneko-sync.json';
const GIST_DESCRIPTION = 'HakuNeko Sync Snapshot';

type GistFile = { content: string };
type GistResponse = {
    id: string;
    files: Record<string, GistFile>;
    updated_at: string;
};

export type GistSyncOptions = {
    token: string;
    gistId?: string;
};

/**
 * Sync via GitHub Gist (private).
 * Stores a single JSON file `hakuneko-sync.json` containing the snapshot.
 */
export class GistSyncProvider implements ISyncProvider {

    public readonly id = 'gist';
    public readonly label = 'GitHub Gist';

    constructor(private readonly options: GistSyncOptions) {}

    private get authHeader(): Record<string, string> {
        return this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {};
    }

    private get gistId(): string | undefined {
        return this.options.gistId || localStorage.getItem('hakuneko:sync:gistId') || undefined;
    }

    private set gistId(value: string | undefined) {
        if (value) localStorage.setItem('hakuneko:sync:gistId', value);
    }

    public async test(): Promise<boolean> {
        if (!this.options.token) return false;
        const res = await fetch('https://api.github.com/user', { headers: this.authHeader });
        return res.ok;
    }

    public async pull(): Promise<SyncSnapshot | null> {
        const id = this.gistId;
        if (!id) return null;
        const res = await fetch(`https://api.github.com/gists/${id}`, { headers: this.authHeader });
        if (!res.ok) return null;
        const gist = await res.json() as GistResponse;
        const file = gist.files[GIST_FILENAME];
        if (!file) return null;
        try {
            return JSON.parse(file.content) as SyncSnapshot;
        } catch {
            return null;
        }
    }

    public async push(snapshot: SyncSnapshot): Promise<void> {
        const content = JSON.stringify(snapshot, null, 2);
        const body: Record<string, unknown> = {
            files: { [GIST_FILENAME]: { content } },
        };

        const id = this.gistId;
        if (id) {
            const res = await fetch(`https://api.github.com/gists/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...this.authHeader },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`Gist push failed: ${res.status} ${await res.text()}`);
        } else {
            const res = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.authHeader },
                body: JSON.stringify({ description: GIST_DESCRIPTION, public: false, ...body }),
            });
            if (!res.ok) throw new Error(`Gist create failed: ${res.status} ${await res.text()}`);
            const gist = await res.json() as GistResponse;
            this.gistId = gist.id;
        }
    }
}
