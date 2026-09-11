import { PlatformInfo, Runtime } from './PlatformInfo';
import type { OCRBox } from './AI/IOCRProvider';

export const SIDECAR_NAME = '.hakuneko-translate.json';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);

export function IsImageFileName(name: string): boolean {
    const dot = name.lastIndexOf('.');
    return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

export type LocalImageFile = {
    name: string;
    size?: number;
    read(): Promise<Blob>;
};

/**
 * An opened local folder. On the `.exe` build files are read through the
 * main process (native dialog + fs, no permission prompts). On the web
 * build the File System Access API is used (browser asks permission).
 * Translations are kept next to the folder in a sidecar file, so moving
 * the folder keeps them.
 */
export type LocalFolderHandle = {
    label: string;
    files: LocalImageFile[];
    readSidecar(): Promise<Record<string, OCRBox[]> | null>;
    writeSidecar(data: Record<string, OCRBox[]>): Promise<void>;
};

export function IsNativeLocalFolder(): boolean {
    try {
        if (typeof window !== 'undefined' && (window as unknown as { ipcRenderer?: unknown }).ipcRenderer) return true;
        if (typeof globalThis !== 'undefined' && (globalThis as unknown as { ipcRenderer?: unknown }).ipcRenderer) return true;
        return new PlatformInfo().Runtime === Runtime.Electron;
    } catch {
        return false;
    }
}

function DecodeBase64(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function WithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} treo quá ${ms / 1000}s — thử lại`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); }) as Promise<T>;
}

async function PickNativeDirectory(): Promise<LocalFolderHandle | null> {
    const { GetIPC } = await import('./electron/InterProcessCommunication');
    const { Channels } = await import('../../../../app/electron/src/ipc/InterProcessCommunicationChannels');
    const ipc = GetIPC();
    try {
        await WithTimeout(ipc.Invoke(Channels.LocalFolder.Ping), 5000, 'Kết nối exe');
    } catch {
        throw new Error('Bản exe này quá cũ (thiếu LocalFolder). Hãy tải lại bản nightly mới từ tag nightly.');
    }
    const dir = await ipc.Invoke(Channels.LocalFolder.OpenDialog);
    if (!dir) return null;
    const entries = await WithTimeout(ipc.Invoke(Channels.LocalFolder.ListDirectory, dir), 30000, 'Đọc thư mục');
    const files: LocalImageFile[] = entries
        .filter(entry => IsImageFileName(entry.name))
        .map(entry => ({
            name: entry.name,
            size: entry.size,
            read: async () => {
                const data = await WithTimeout(ipc.Invoke(Channels.LocalFolder.ReadFile, dir, entry.name), 30000, `Đọc file ${entry.name}`);
                return new Blob([DecodeBase64(data.base64)], { type: data.mime });
            },
        }));
    return {
        label: dir,
        files,
        readSidecar: async () => {
            const raw = await WithTimeout(ipc.Invoke(Channels.LocalFolder.ReadSidecar, dir), 5000, 'Đọc sidecar');
            if (!raw) return null;
            try {
                return JSON.parse(raw) as Record<string, OCRBox[]>;
            } catch {
                return null;
            }
        },
        writeSidecar: async (data) => {
            await WithTimeout(ipc.Invoke(Channels.LocalFolder.WriteSidecar, dir, JSON.stringify(data)), 5000, 'Ghi sidecar');
        },
    };
}

async function PickWebDirectory(): Promise<LocalFolderHandle | null> {
    let dirHandle: FileSystemDirectoryHandle;
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch {
        return null; // user cancelled or not supported
    }
    const files: LocalImageFile[] = [];
    for await (const handle of dirHandle.values()) {
        if (handle.kind === 'file' && IsImageFileName(handle.name)) {
            const fileHandle = handle as FileSystemFileHandle;
            files.push({
                name: fileHandle.name,
                read: () => fileHandle.getFile(),
            });
        }
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return {
        label: dirHandle.name,
        files,
        readSidecar: async () => {
            try {
                const fileHandle = await dirHandle.getFileHandle(SIDECAR_NAME, { create: false });
                const file = await fileHandle.getFile();
                return JSON.parse(await file.text()) as Record<string, OCRBox[]>;
            } catch {
                return null;
            }
        },
        writeSidecar: async (data) => {
            const fileHandle = await dirHandle.getFileHandle(SIDECAR_NAME, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(data));
            await writable.close();
        },
    };
}

/**
 * Ask the user to pick a folder with manga pages.
 * Returns `null` when the user cancels.
 */
export async function PickLocalDirectory(): Promise<LocalFolderHandle | null> {
    if (IsNativeLocalFolder()) {
        return PickNativeDirectory();
    }
    return PickWebDirectory();
}
