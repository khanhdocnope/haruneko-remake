import type { IAITranslationProvider, TranslateOptions } from './AITranslationProvider';

export type OpenAIProviderConfig = {
    apiKey: string;
    model?: string;
    baseURL?: string;
};

export class OpenAIProvider implements IAITranslationProvider {

    public readonly ID = 'openai' as const;
    public readonly Label = 'OpenAI';

    constructor(private readonly config: OpenAIProviderConfig) {}

    private get Model(): string {
        return this.config.model || 'gpt-4o-mini';
    }

    private get BaseURL(): string {
        return this.config.baseURL || 'https://api.openai.com/v1';
    }

    public async Test(): Promise<boolean> {
        if (!this.config.apiKey) return false;
        try {
            const res = await fetch(`${this.BaseURL}/models`, {
                headers: { Authorization: `Bearer ${this.config.apiKey}` },
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    public async Translate(text: string, options: TranslateOptions): Promise<string> {
        const prompt = `Translate the following text to ${options.targetLang}. Keep proper nouns (character names, place names) unchanged. Only return the translated text without explanation.\n\nContext: ${options.context ?? 'manga/anime UI'}\nText: ${text}`;
        const res = await fetch(`${this.BaseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: this.Model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
            }),
        });
        if (!res.ok) throw new Error(`OpenAI translate failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as { choices: { message: { content: string } }[] };
        return data.choices[0]?.message?.content?.trim() ?? text;
    }
}
