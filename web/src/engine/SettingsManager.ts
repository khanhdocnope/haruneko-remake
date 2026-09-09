import { EngineResourceKey, type IResource, EngineResourceKey as R } from '../i18n/ILocale';
import { type StorageController, Store } from './StorageController';
import { Observable } from './Observable';
import { Scope } from './SettingsGlobal';
import { Exception } from './Error';

//const secret = 'E8463362D9B817D3956F054D01093EC6'; // MD5('simple.encryption.key.for.secret.settings')

/**
 * AES-GCM encryption for Secret settings.
 * Uses a derived key from a fixed app salt + passphrase.
 * Falls back to btoa/atob for migration / when crypto unavailable.
 */
const SYNC_CRYPTO_SALT = 'hakuneko-sync-salt-v1';
const SYNC_CRYPTO_IV_LEN = 12;

async function DeriveKey(passphrase: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase || 'HakuNeko-Default-Secret-Key'), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode(SYNC_CRYPTO_SALT), iterations: 100000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function EncryptAESGCM(plain: string, passphrase: string): Promise<string> {
    try {
        const key = await DeriveKey(passphrase);
        const iv = crypto.getRandomValues(new Uint8Array(SYNC_CRYPTO_IV_LEN));
        const enc = new TextEncoder();
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
        const combined = new Uint8Array(iv.length + cipher.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(cipher), iv.length);
        return 'v1:' + btoa(String.fromCharCode(...combined));
    } catch {
        return btoa(plain);
    }
}

async function DecryptAESGCM(encrypted: string, passphrase: string): Promise<string> {
    try {
        if (!encrypted.startsWith('v1:')) return atob(encrypted);
        const raw = encrypted.slice(3);
        const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
        const iv = bytes.slice(0, SYNC_CRYPTO_IV_LEN);
        const data = bytes.slice(SYNC_CRYPTO_IV_LEN);
        const key = await DeriveKey(passphrase);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(plain);
    } catch {
        try { return atob(encrypted); } catch { return encrypted; }
    }
}

function Encrypt(decrypted: string) {
    // Sync path: encryption is async, so Secret falls back to btoa for sync Serialize.
    // Async encryption is handled via EncryptSecretAsync helper.
    return btoa(decrypted);
}

function Decrypt(encrypted: string) {
    if (encrypted.startsWith('v1:')) {
        // Cannot decrypt sync without passphrase here; return as-is for lazy decrypt
        return encrypted;
    }
    return atob(encrypted);
}

export async function EncryptSecretAsync(plain: string, passphrase?: string): Promise<string> {
    if (passphrase) return EncryptAESGCM(plain, passphrase);
    return btoa(plain);
}

export async function DecryptSecretAsync(encrypted: string, passphrase?: string): Promise<string> {
    if (encrypted.startsWith('v1:')) return DecryptAESGCM(encrypted, passphrase ?? '');
    try { return atob(encrypted); } catch { return encrypted; }
}

export type IValue = string | boolean | number | FileSystemDirectoryHandle;

class Setting<T extends IValue> extends Observable<T> {

    private readonly initial: T;

    constructor(private readonly id: string, private readonly label: keyof IResource, private readonly description: keyof IResource, initial: T) {
        super(initial);
        this.initial = initial;
    }

    public get ID(): string {
        return this.id;
    }

    public get Label(): keyof IResource {
        return this.label;
    }

    public get Description(): keyof IResource {
        return this.description;
    }

    public get Default(): T {
        return this.initial;
    }

    /**
     * Decode and assign the {@link Value} from a raw/encoded format.
     */
    public Deserialize(serialized: IValue) {
        this.Value = serialized as T;
    }

    /**
     * Get the {@link Value} in a raw/encoded format suitable for storage.
     */
    public Serialize(): IValue {
        return this.Value;
    }
}

export type ISetting<T extends IValue = IValue> = Setting<T>;

export class Text extends Setting<string> {

    constructor(id: string, label: keyof IResource, description: keyof IResource, initial: string) {
        super(id, label, description, initial);
    }
}

export class Secret extends Setting<string> {

    constructor(id: string, label: keyof IResource, description: keyof IResource, initial: string) {
        super(id, label, description, initial);
    }

    public override Deserialize(serialized: string): void {
        // Support both legacy btoa and v1 AES-GCM; async decrypt will be done lazily if needed
        try {
            super.Value = Decrypt(serialized);
        } catch {
            super.Value = serialized;
        }
    }

    public override Serialize(): string {
        return Encrypt(super.Value);
    }

    public async DeserializeAsync(encrypted: string, passphrase?: string): Promise<void> {
        super.Value = await DecryptSecretAsync(encrypted, passphrase);
    }

    public async SerializeAsync(passphrase?: string): Promise<string> {
        return EncryptSecretAsync(super.Value, passphrase);
    }
}

export class Check extends Setting<boolean> {

    constructor(id: string, label: keyof IResource, description: keyof IResource, initial: boolean) {
        super(id, label, description, initial);
    }
}

type IOption = { key: string, label: keyof IResource }

export class Choice extends Setting<string> {

    constructor(id: string, label: keyof IResource, description: keyof IResource, initial: string, ...options: IOption[]) {
        super(id, label, description, initial);
        this.options = options;
    }

    private NormalizeValue(value: string) {
        return this.options.some(option => option.key === value) ? value : super.Default;
    }

    public get Value(): string {
        return this.NormalizeValue(super.Value);
    }

    public set Value(value: string) {
        super.Value = this.NormalizeValue(value);
    }

    private readonly options: IOption[];
    public get Options(): IOption[] {
        return this.options;
    }
}

export class Numeric extends Setting<number> {

    constructor(id: string, label: keyof IResource, description: keyof IResource, initial: number, min: number, max: number) {
        super(id, label, description, initial);
        this.min = min;
        this.max = max;
    }

    private NormalizeValue(value: number) {
        return Math.min(this.Max, Math.max(value, this.Min));
    }

    public get Value(): number {
        return this.NormalizeValue(super.Value);
    }

    public set Value(value: number) {
        super.Value = this.NormalizeValue(value);
    }

    private min: number;
    public get Min(): number {
        return this.min;
    }

    private max: number;
    public get Max(): number {
        return this.max;
    }
}

export class Directory extends Setting<FileSystemDirectoryHandle> {

    constructor(id: string, label: keyof IResource, description: keyof IResource, initial: FileSystemDirectoryHandle) {
        super(id, label, description, initial);
    }

    /**
     * Check if the directory is accessible and optionally tries to elevate permissions (user prompt).
     * This method must be invoked through user interaction (e.g., click event).
     * @throws {@link Exception} if the directory is not set or the permission for write access was denied
     */
    public async EnsureAccess(): Promise<void> {
        if(!this.Value) {
            throw new Exception(EngineResourceKey.Settings_Global_MediaDirectory_UnsetError);
        }
        if(await this.Value.queryPermission({ mode: 'readwrite' }) !== 'granted' && await this.Value.requestPermission({ mode: 'readwrite' }) !== 'granted') {
            throw new Exception(EngineResourceKey.Settings_Global_MediaDirectory_PermissionError);
        }
    }
}

class Settings implements Iterable<ISetting> {

    private readonly settings: Record<string, ISetting> = {};

    constructor(private readonly scope: string, private readonly storage: StorageController) {
    }

    /**
     * Notify subscribers and store the current values of all settings to the persistent storage.
     */
    private async SaveAllSettings() {
        const data: Record<string, IValue> = {};
        for(const key in this.settings) {
            data[key] = this.settings[key].Serialize();
        }
        await this.storage.SavePersistent(data, Store.Settings, this.scope);
    }

    /**
     * Configure all available settings and apply the stored values from the persistent storage.
     */
    public async Initialize(...settings: ISetting[]): Promise<void> {
        // TODO: May disable Initialize() to prevent breaking existing settings?
        const data = await this.storage.LoadPersistent<Record<string, IValue>>(Store.Settings, this.scope);
        for(const setting of settings) {
            if(!this.settings[setting.ID]) {
                if(data !== undefined && data[setting.ID] !== undefined) {
                    setting.Deserialize(data[setting.ID]);
                }
                setting.Subscribe(this.SaveAllSettings.bind(this));
                this.settings[setting.ID] = setting;
            }
        }
        // TODO: Can this just be ignored with a `Promise.resolve()` instead of raising an error?
        this.Initialize = () => Promise.reject(new Exception(R.SettingsManager_Settings_AlreadyInitializedError, this.scope));
    }

    /**
     * Get the setting for a certain key.
     */
    public Get<T extends ISetting>(key: string): T {
        return this.settings[key] as T;
    }

    *[Symbol.iterator]()/*: Iterator<ISetting>*/ {
        for(const key in this.settings) {
            yield this.settings[key];
        }
    }
}

export type ISettings = Settings;

export class SettingsManager {

    private readonly storage: StorageController;
    private readonly scopes: Record<string, Settings> = {};

    constructor(storage: StorageController) {
        this.storage = storage;
    }

    /**
     * Get the settings for the given scope, or creates new settings if the scope not yet exists.
     * If no scope identifier is provided, the global settings will be returned.
     */
    public OpenScope(scope?: string): ISettings {
        scope = scope || Scope;
        return this.scopes[scope] || (this.scopes[scope] = new Settings(scope, this.storage));
    }
}