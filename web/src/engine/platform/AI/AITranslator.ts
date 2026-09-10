import { Store, type StorageController } from '../../StorageController';
import { TaskPool, Priority } from '../../taskpool/TaskPool';
import { RateLimit } from '../../taskpool/RateLimit';
import type { IAITranslationProvider } from './AITranslationProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';
import { DeepLProvider } from './DeepLProvider';
import { GoogleProvider } from './GoogleProvider';
import type { ISettings, Choice, Secret, Text, Check } from '../../SettingsManager';

type CacheEntry = { translated: string; timestamp: number };

export class AITranslator {

    private provider: IAITranslationProvider | null = null;
    private readonly pool = new TaskPool(3, new RateLimit(10, 60));
    private memoryCache = new Map<string, CacheEntry>();
    private readonly cacheTTL = 30 * 24 * 60 * 60 * 1000; // 30 days

    constructor(
        private readonly storage: StorageController,
        private readonly settings: ISettings,
    ) {
        this.RefreshProvider();
        try {
            this.settings.Get<Choice>('ai-provider')?.Subscribe(() => this.RefreshProvider());
            this.settings.Get<Secret>('ai-key')?.Subscribe(() => this.RefreshProvider());
            this.settings.Get<Text>('ai-model')?.Subscribe(() => this.RefreshProvider());
        } catch { /* ignore */ }
    }

    private RefreshProvider(): void {
        try {
            const id = (this.settings.Get<Choice>('ai-provider')?.Value ?? 'none') as string;
            const key = this.settings.Get<Secret>('ai-key')?.Value ?? '';
            const model = this.settings.Get<Text>('ai-model')?.Value ?? '';
            if (id === 'openai') this.provider = new OpenAIProvider({ apiKey: key, model });
            else if (id === 'gemini') this.provider = new GeminiProvider({ apiKey: key, model });
            else if (id === 'deepl') this.provider = new DeepLProvider({ apiKey: key });
            else if (id === 'google') this.provider = new GoogleProvider();
            else this.provider = null;
        } catch {
            this.provider = null;
        }
    }

    public IsEnabled(): boolean {
        return !!this.provider;
    }

    public IsAutoEnabled(): boolean {
        try {
            return !!this.settings.Get<Check>('ai-autotranslate')?.Value;
        } catch {
            return false;
        }
    }

    private CacheKey(text: string, target: string): string {
        return `${this.provider?.ID ?? 'none'}:${target}:${text}`;
    }

    public async Translate(text: string, targetLang?: string, context?: string): Promise<string> {
        if (!text || !this.provider) return text;
        const target = targetLang ?? this.settings.Get<Choice>('ai-target-language')?.Value ?? 'vi';
        const key = this.CacheKey(text, target);

        const mem = this.memoryCache.get(key);
        if (mem && Date.now() - mem.timestamp < this.cacheTTL) return mem.translated;

        const cached = await this.storage.LoadPersistent<string>(Store.TranslationCache, key).catch(() => undefined);
        if (cached) {
            this.memoryCache.set(key, { translated: cached, timestamp: Date.now() });
            return cached;
        }

        const translated = await this.pool.Add(() => this.provider!.Translate(text, { targetLang: target, context }), Priority.Normal);

        this.memoryCache.set(key, { translated, timestamp: Date.now() });
        await this.storage.SavePersistent(translated, Store.TranslationCache, key).catch(() => {});

        return translated;
    }

    public async TranslateBatch(texts: string[], targetLang?: string, context?: string): Promise<string[]> {
        return Promise.all(texts.map(t => this.Translate(t, targetLang, context)));
    }

    public async Test(): Promise<boolean> {
        if (!this.provider) return false;
        return this.provider.Test();
    }
}
