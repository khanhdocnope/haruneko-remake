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
        navigator.storage.persist().catch(console.warn);
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
                const db = connection.result; // => event.target.result
                for(let version = event.oldVersion; version < event.newVersion; version++) {
                    VersionUpgrades[version](db);
                }
            };
            connection.onsuccess = () => resolve(connection.result);
            connection.onerror = () => reject(connection.error);
        });
    }

    private async SaveIDB<T>(value: T, store: UnitedStore, key?: string): Promise<void> {
        const db = await this.Connect();
        const tx = db.transaction(store, 'readwrite');
        const bucket = tx.objectStore(store);
        const queries = key ? [ bucket.put(value, key) ] : Object.keys(value).map(key => bucket.put(value[key], key));
        const promises = queries.map(query => new Promise<void>((resolve, reject) => {
            query.onsuccess = () => resolve(/*query.result*/);
            query.onerror = () => reject(query.error);
        }));
        tx.oncomplete = () => db.close();
        tx.commit();
        await Promise.all(promises);
    }

    private async LoadIDB<T>(store: UnitedStore, key?: string): Promise<T> {
        const db = await this.Connect();
        const tx = db.transaction(store, 'readonly');
        const bucket = tx.objectStore(store);
        const query = key ? bucket.get(key) : bucket.getAll();
        const promise = new Promise<T>((resolve, reject) => {
            query.onsuccess = () => resolve(query.result as T);
            query.onerror = () => reject(query.error);
        });
        tx.oncomplete = () => db.close();
        tx.commit();
        return promise;
    }

    private async RemoveIDB(store: UnitedStore, ...keys: string[]): Promise<void> {
        const db = await this.Connect();
        const tx = db.transaction(store, 'readwrite');
        const bucket = tx.objectStore(store);
        const queries = keys.length > 0 ? keys.map(key => bucket.delete(key)) : [ bucket.clear() ];
        const promises = queries.map(query => new Promise<void>((resolve, reject) => {
            query.onsuccess = () => resolve(/*query.result*/);
            query.onerror = () => reject(query.error);
        }));
        tx.oncomplete = () => db.close();
        tx.commit();
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
        this.NotifyWatchers(store, keys[0]);
    }

    public async SaveTemporary<T>(value: T): Promise<string> {
        const key = Date.now().toString() + Math.random().toString();
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