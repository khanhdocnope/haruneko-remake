import type { IAITranslationProvider, TranslateOptions } from './AITranslationProvider';

export type GeminiProviderConfig = {
    apiKey: string;
    model?: string;
};

export class GeminiProvider implements IAITranslationProvider {

    public readonly ID = 'gemini' as const;
    public readonly Label = 'Gemini';

    constructor(private readonly config: GeminiProviderConfig) {}

    private get Model(): string {
        return this.config.model || 'gemini-1.5-flash';
    }

    public async Test(): Promise<boolean> {
        if (!this.config.apiKey) return false;
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`);
            return res.ok;
        } catch {
            return false;
        }
    }

    public async Translate(text: string, options: TranslateOptions): Promise<string> {
        const prompt = `Translate to ${options.targetLang}. Keep proper nouns unchanged. Only return translation.\nContext: ${options.context ?? 'manga/anime UI'}\nText: ${text}`;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.Model}:generateContent?key=${this.config.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!res.ok) throw new Error(`Gemini translate failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
        return data.candidates[0]?.content?.parts[0]?.text?.trim() ?? text;
    }
}
