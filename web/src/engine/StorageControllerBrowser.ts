import { type StorageController, Store, type StorageWatchCallback } from './StorageController';

const DataBase = 'HakuNeko';

const enum InternalStore {
    TemporaryData = 'TemporaryData',
}

type UnitedStore = Store | InternalStore;

const VersionUpgrades = [
    // V0 => V1
    function V1(db: IDBDatabase) {
        db.createObjectStore(Store.Settings);
    },
    // V1 => V2
    function V2(db: IDBDatabase) {
        db.createObjectStore(Store.Bookmarks);
    },
    // V2 => V3
    function V3(db: IDBDatabase) {
        db.createObjectStore(Store.MediaLists);
    },
    // V3 => V4
    function V4(db: IDBDatabase) {
        db.createObjectStore(InternalStore.TemporaryData);
    },
    // V4 => V5
    function V5(db: IDBDatabase) {
        db.createObjectStore(Store.Itemflags);
    },
    // V5 => V6
    function V6(db: IDBDatabase) {
        if (!db.objectStoreNames.contains(Store.DownloadedMedia)) {
            db.createObjectStore(Store.DownloadedMedia);
        }
    },
    // V6 => V7
    function V7(db: IDBDatabase) {
        if (!db.objectStoreNames.contains(Store.TranslationCache)) {
            db.createObjectStore(Store.TranslationCache);
        }
    },
    // V7 => V8
    function V8(db: IDBDatabase) {
        if (!db.objectStoreNames.contains(Store.ImageOCRCache)) {
            db.createObjectStore(Store.ImageOCRCache);
        }
    },
];

const Version = VersionUpgrades.length;

/**
 * A storage controller that uses the {@link indexedDB} and the {@link https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API|File System Access API}.
 * It is intended to be used within modern web-browsers.
 */
export class StorageControllerBrowser implements StorageController {

    private readonly watchers = new Set<StorageWatchCallback>();
    private revisions = new Map<Store, number>();

    constructor() {
        try { navigator.storage?.persist()?.catch(console.warn); } catch { /* ignore */ }
    }

    public Watch(callback: StorageWatchCallback): () => void {
        this.watchers.add(callback);
        return () => this.watchers.delete(callback);
    }

    public async GetRevision(store: Store): Promise<number> {
        return this.revisions.get(store) ?? 0;
    }

    private NotifyWatchers(store: Store, key?: string): void {
        this.revisions.set(store, (this.revisions.get(store) ?? 0) + 1);
        for (const cb of this.watchers) {
            try { cb(store, key); } catch { /* ignore */ }
        }
    }

    private async Connect(): Promise<IDBDatabase> {
        const connection = indexedDB.open(DataBase, Version);
        return new Promise<IDBDatabase>((resolve, reject) => {
            connection.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result ?? connection.result;
                for(let version = event.oldVersion; version < (event.newVersion ?? Version); version++) {
                    if (version < VersionUpgrades.length) VersionUpgrades[version](db);
                }
            };
            connection.onsuccess = () => resolve(connection.result);
            connection.onerror = () => reject(connection.error);
            connection.onblocked = () => console.warn('IDB blocked');
        });
    }

    private async SaveIDB<T>(value: T, store: UnitedStore, key?: string): Promise<void> {
        const db = await this.Connect();
        const tx = db.transaction(store, 'readwrite');
        const bucket = tx.objectStore(store);
        const queries = key ? [ bucket.put(value, key) ] : Object.keys(value as object).map(k => bucket.put((value as Record<string, unknown>)[k], k));
        const promises = queries.map(query => new Promise<void>((resolve, reject) => {
            query.onsuccess = () => resolve();
            query.onerror = () => reject(query.error);
            (query.transaction as IDBTransaction).onerror = () => reject(query.error);
        }));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        if ('commit' in tx) (tx as unknown as { commit: () => void }).commit();
        await Promise.all(promises);
    }

    private async LoadIDB<T>(store: UnitedStore, key?: string): Promise<T> {
        const db = await this.Connect();
        const tx = db.transaction(store, 'readonly');
        const bucket = tx.objectStore(store);
        if (key) {
            const query = bucket.get(key);
            const promise = new Promise<T>((resolve, reject) => {
                query.onsuccess = () => resolve(query.result as T);
                query.onerror = () => reject(query.error);
            });
            tx.oncomplete = () => db.close();
            tx.onerror = () => db.close();
            if ('commit' in tx) (tx as unknown as { commit: () => void }).commit();
            return promise;
        } else {
            // Reconstruct Record from cursor to preserve keys
            const promise = new Promise<T>((resolve, reject) => {
                const result: Record<string, unknown> = {};
                let hasKeys = false;
                const cursorReq = bucket.openCursor();
                cursorReq.onsuccess = () => {
                    const cursor = cursorReq.result;
                    if (cursor) {
                        hasKeys = true;
                        result[cursor.key as string] = cursor.value;
                        cursor.continue();
                    } else {
                        if (hasKeys) resolve(result as T);
                        else {
                            // Fallback: getAll for stores without keys (e.g., legacy)
                            const allReq = bucket.getAll();
                            allReq.onsuccess = () => resolve(allReq.result as T);
                            allReq.onerror = () => reject(allReq.error);
                        }
                    }
                };
                cursorReq.onerror = () => reject(cursorReq.error);
            });
            tx.oncomplete = () => db.close();
            tx.onerror = () => db.close();
            if ('commit' in tx) (tx as unknown as { commit: () => void }).commit();
            return promise;
        }
    }

    private async RemoveIDB(store: UnitedStore, ...keys: string[]): Promise<void> {
        const db = await this.Connect();
        const tx = db.transaction(store, 'readwrite');
        const bucket = tx.objectStore(store);
        if (keys.length === 0) return;
        const queries = keys.map(k => bucket.delete(k));
        const promises = queries.map(query => new Promise<void>((resolve, reject) => {
            query.onsuccess = () => resolve();
            query.onerror = () => reject(query.error);
        }));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        if ('commit' in tx) (tx as unknown as { commit: () => void }).commit();
        await Promise.all(promises);
    }

    public async SavePersistent<T>(value: T, store: Store, key?: string): Promise<void> {
        await this.SaveIDB(value, store, key);
        this.NotifyWatchers(store, key);
    }

    public async LoadPersistent<T>(store: Store, key?: string): Promise<T> {
        return this.LoadIDB(store, key);
    }

    public async RemovePersistent(store: Store, ...keys: string[]): Promise<void> {
        await this.RemoveIDB(store, ...keys);
        for (const k of keys) this.NotifyWatchers(store, k);
        if (keys.length === 0) this.NotifyWatchers(store);
    }

    public async SaveTemporary<T>(value: T): Promise<string> {
        const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const key = uuid;
        await this.SaveIDB(value, InternalStore.TemporaryData, key);
        return key;
    }

    public async LoadTemporary<T>(key: string): Promise<T> {
        return this.LoadIDB(InternalStore.TemporaryData, key);
    }

    public async RemoveTemporary(...keys: string[]): Promise<void> {
        return this.RemoveIDB(InternalStore.TemporaryData, ...keys);
    }
}