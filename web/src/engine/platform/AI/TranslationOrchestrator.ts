import { Store, type StorageController } from '../../StorageController';
import { TaskPool, Priority } from '../../taskpool/TaskPool';
import { RateLimit } from '../../taskpool/RateLimit';
import type { IAITranslationProvider } from './AITranslationProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';
import { DeepLProvider } from './DeepLProvider';
import { GoogleProvider } from './GoogleProvider';
import type { IOCRProvider, OCRBox } from './IOCRProvider';
import type { IVisionProvider } from './IVisionProvider';
import { TesseractProvider } from './TesseractProvider';
import { OpenAIVisionProvider } from './OpenAIVisionProvider';
import { GeminiVisionProvider } from './GeminiVisionProvider';
import { GoogleVisionProvider } from './GoogleVisionProvider';
import type { ISettings, Choice, Secret, Text } from '../../SettingsManager';

type CacheEntry = { translated: string; timestamp: number };

/**
 * Unified translation + OCR pipeline (breaking rewrite of AITranslator).
 * List chọn: openai/gemini/deepl/google (text) + tesseract/openai-vision/gemini-vision/google-vision (image bubble).
 * Manual per-page: chỉ khi bấm nút "Dịch ảnh" mới gọi RecognizeAndTranslate, bong bóng che chữ gốc.
 * OCR language: auto, đích vi mặc định.
 */
export class TranslationOrchestrator {

    private textProvider: IAITranslationProvider | null = null;
    private ocrProvider: IOCRProvider | null = null;
    private visionProvider: IVisionProvider | null = null;

    private readonly textPool = new TaskPool(3, new RateLimit(10, 60));
    private readonly visionPool = new TaskPool(2, new RateLimit(5, 60));
    private memoryCache = new Map<string, CacheEntry>();
    private imageCache = new Map<string, { boxes: OCRBox[]; timestamp: number }>();
    private readonly cacheTTL = 30 * 24 * 60 * 60 * 1000;

    constructor(
        private readonly storage: StorageController,
        private readonly settings: ISettings,
    ) {
        this.RefreshProviders();
        try {
            this.settings.Get<Choice>('ai-provider')?.Subscribe(() => this.RefreshProviders());
            this.settings.Get<Secret>('ai-key')?.Subscribe(() => this.RefreshProviders());
            this.settings.Get<Text>('ai-model')?.Subscribe(() => this.RefreshProviders());
            this.settings.Get<Choice>('ocr-provider')?.Subscribe(() => this.RefreshProviders());
        } catch { /* ignore */ }
    }

    private RefreshProviders(): void {
        try {
            const textId = (this.settings.Get<Choice>('ai-provider')?.Value ?? 'none') as string;
            const key = this.settings.Get<Secret>('ai-key')?.Value ?? '';
            const model = this.settings.Get<Text>('ai-model')?.Value ?? '';

            if (textId === 'openai') this.textProvider = new OpenAIProvider({ apiKey: key, model });
            else if (textId === 'gemini') this.textProvider = new GeminiProvider({ apiKey: key, model });
            else if (textId === 'deepl') this.textProvider = new DeepLProvider({ apiKey: key });
            else if (textId === 'google') this.textProvider = new GoogleProvider();
            else this.textProvider = null;

            const ocrId = (this.settings.Get<Choice>('ocr-provider')?.Value ?? 'none') as string;
            this.ocrProvider = null;
            this.visionProvider = null;
            if (ocrId === 'tesseract') this.ocrProvider = new TesseractProvider();
            else if (ocrId === 'openai-vision') this.visionProvider = new OpenAIVisionProvider({ apiKey: key, model });
            else if (ocrId === 'gemini-vision') this.visionProvider = new GeminiVisionProvider({ apiKey: key, model });
            else if (ocrId === 'google-vision') this.visionProvider = new GoogleVisionProvider({ apiKey: key });
        } catch {
            this.textProvider = null;
            this.ocrProvider = null;
            this.visionProvider = null;
        }
    }

    public IsEnabled(): boolean {
        return !!this.textProvider;
    }

    public IsOCREnabled(): boolean {
        return !!this.ocrProvider || !!this.visionProvider;
    }

    private TextCacheKey(text: string, target: string): string {
        return `v2:text:${this.textProvider?.ID ?? 'none'}:${target}:${text}`;
    }

    private ImageCacheKey(hash: string, target: string): string {
        return `v2:ocr:${this.ocrProvider?.ID ?? this.visionProvider?.ID ?? 'none'}:${target}:${hash}`;
    }

    private async HashBlob(blob: Blob): Promise<string> {
        const buf = await blob.arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }

    // — Text (unified, giữ API cũ) —

    public async Translate(text: string, targetLang?: string, context?: string): Promise<string> {
        if (!text || !this.textProvider) return text;
        const target = targetLang ?? this.settings.Get<Choice>('ai-target-language')?.Value ?? 'vi';
        const key = this.TextCacheKey(text, target);

        const mem = this.memoryCache.get(key);
        if (mem && Date.now() - mem.timestamp < this.cacheTTL) return mem.translated;

        const cached = await this.storage.LoadPersistent<string>(Store.TranslationCache, key).catch(() => undefined);
        if (cached) {
            this.memoryCache.set(key, { translated: cached, timestamp: Date.now() });
            return cached;
        }

        let translated: string;
        try {
            translated = await this.textPool.Add(() => this.textProvider!.Translate(text, { targetLang: target, context }), Priority.Normal);
        } catch {
            // Fallback to Google free
            try {
                translated = await new GoogleProvider().Translate(text, { targetLang: target, context });
            } catch {
                return text;
            }
        }

        this.memoryCache.set(key, { translated, timestamp: Date.now() });
        await this.storage.SavePersistent(translated, Store.TranslationCache, key).catch(() => {});
        return translated;
    }

    public async TranslateBatch(texts: string[], targetLang?: string, context?: string): Promise<string[]> {
        return Promise.all(texts.map(t => this.Translate(t, targetLang, context)));
    }

    // — Image OCR/Vision (manual per-page, bong bóng che chữ gốc, auto lang, vi đích) —

    public async RecognizeAndTranslateImage(blob: Blob, targetLang?: string): Promise<OCRBox[]> {
        if (!this.IsOCREnabled()) return [];
        const target = targetLang ?? 'vi';
        const hash = await this.HashBlob(blob);
        const key = this.ImageCacheKey(hash, target);

        const memImg = this.imageCache.get(key);
        if (memImg && Date.now() - memImg.timestamp < this.cacheTTL) return memImg.boxes;

        const cached = await this.storage.LoadPersistent<OCRBox[]>(Store.ImageOCRCache, key).catch(() => undefined);
        if (cached) {
            this.imageCache.set(key, { boxes: cached, timestamp: Date.now() });
            return cached;
        }

        let boxes: OCRBox[] = [];
        if (this.visionProvider) {
            boxes = await this.visionPool.Add(() => this.visionProvider!.RecognizeAndTranslate(blob, target), Priority.Normal);
        } else if (this.ocrProvider) {
            const raw = await this.visionPool.Add(() => this.ocrProvider!.Recognize(blob, { language: 'auto' }), Priority.Normal);
            // Translate each box text to vi
            const texts = raw.map(b => b.text);
            const translated = await this.TranslateBatch(texts, target, 'manga bubble, keep proper nouns, short');
            boxes = raw.map((b, i) => ({ ...b, text: translated[i] ?? b.text }));
        }

        this.imageCache.set(key, { boxes, timestamp: Date.now() });
        await this.storage.SavePersistent(boxes, Store.ImageOCRCache, key).catch(() => {});
        return boxes;
    }

    public async Test(): Promise<boolean> {
        if (this.textProvider) return this.textProvider.Test();
        if (this.visionProvider) return this.visionProvider.Test();
        if (this.ocrProvider) return this.ocrProvider.Test();
        return false;
    }

    public async TestOCR(): Promise<boolean> {
        if (this.visionProvider) return this.visionProvider.Test();
        if (this.ocrProvider) return this.ocrProvider.Test();
        return false;
    }
}

// Breaking: keep old name as alias for migration (will be removed)
export { TranslationOrchestrator as AITranslator };
