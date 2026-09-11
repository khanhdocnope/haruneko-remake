import path from 'path';
import fs from 'fs/promises';
import { dialog } from 'electron';
import type { IPC } from './InterProcessCommunication';
import { Channels } from './InterProcessCommunicationChannels';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const SIDECAR_NAME = '.hakuneko-translate.json';

const MIME_BY_EXTENSION: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
};

export type LocalFileEntry = {
    name: string;
    size: number;
};

export type LocalFileData = {
    mime: string;
    base64: string;
};

/**
 * Lets the web app browse image folders on disk through the main process.
 * All reads/writes are confined to a user-picked directory (native dialog),
 * file names are always treated as basenames to prevent path traversal.
 */
export class LocalFolder {

    constructor(private readonly ipc: IPC) {
        this.ipc.Handle(Channels.LocalFolder.Ping, this.Ping.bind(this));
        this.ipc.Handle(Channels.LocalFolder.OpenDialog, this.OpenDialog.bind(this));
        this.ipc.Handle(Channels.LocalFolder.ListDirectory, this.ListDirectory.bind(this));
        this.ipc.Handle(Channels.LocalFolder.ReadFile, this.ReadFile.bind(this));
        this.ipc.Handle(Channels.LocalFolder.ReadSidecar, this.ReadSidecar.bind(this));
        this.ipc.Handle(Channels.LocalFolder.WriteSidecar, this.WriteSidecar.bind(this));
    }

    private async Ping(): Promise<string> {
        return 'ok';
    }

    private async OpenDialog(): Promise<string | null> {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    }

    private ResolveInside(dir: string, name: string): string {
        const full = path.resolve(dir, path.basename(name));
        const root = path.resolve(dir);
        if (full !== root && !full.startsWith(root + path.sep)) {
            throw new Error('File is outside the selected folder');
        }
        return full;
    }

    private async ListDirectory(dir: string): Promise<LocalFileEntry[]> {
        const stats = await fs.stat(dir);
        if (!stats.isDirectory()) throw new Error('Not a directory');
        const names = await fs.readdir(dir);
        const entries: LocalFileEntry[] = [];
        for (const name of names) {
            const ext = path.extname(name).toLowerCase();
            if (!IMAGE_EXTENSIONS.has(ext)) continue;
            try {
                const fileStats = await fs.stat(this.ResolveInside(dir, name));
                if (fileStats.isFile()) entries.push({ name, size: fileStats.size });
            } catch { /* skip unreadable files */ }
        }
        entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        return entries;
    }

    private async ReadFile(dir: string, name: string): Promise<LocalFileData> {
        const full = this.ResolveInside(dir, name);
        const ext = path.extname(full).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('Not an image file');
        const buffer = await fs.readFile(full);
        return { mime: MIME_BY_EXTENSION[ext] ?? 'image/jpeg', base64: buffer.toString('base64') };
    }

    private async ReadSidecar(dir: string): Promise<string | null> {
        try {
            return await fs.readFile(this.ResolveInside(dir, SIDECAR_NAME), 'utf-8');
        } catch {
            return null;
        }
    }

    private async WriteSidecar(dir: string, content: string): Promise<void> {
        if (content.length > 10 * 1024 * 1024) throw new Error('Sidecar too large');
        await fs.writeFile(this.ResolveInside(dir, SIDECAR_NAME), content, 'utf-8');
    }
}
