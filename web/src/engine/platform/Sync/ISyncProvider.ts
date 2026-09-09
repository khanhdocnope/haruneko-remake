import type { Store } from '../../StorageController';

export type SyncSnapshot = {
    revision: number;
    timestamp: number;
    stores: Partial<Record<Store, unknown>>;
    version: 1;
};

export interface ISyncProvider {
    readonly id: string;
    readonly label: string;
    Pull(): Promise<SyncSnapshot | null>;
    Push(snapshot: SyncSnapshot): Promise<void>;
    Test(): Promise<boolean>;
}
