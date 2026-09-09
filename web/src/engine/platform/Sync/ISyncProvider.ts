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
    pull(): Promise<SyncSnapshot | null>;
    push(snapshot: SyncSnapshot): Promise<void>;
    test(): Promise<boolean>;
}
