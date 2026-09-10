import type { IAITranslationProvider, TranslateOptions } from './AITranslationProvider';

export type DeepLProviderConfig = {
    apiKey: string;
};

export class DeepLProvider implements IAITranslationProvider {

    public readonly ID = 'deepl' as const;
    public readonly Label = 'DeepL';

    constructor(private readonly config: DeepLProviderConfig) {}

    public async Test(): Promise<boolean> {
        if (!this.config.apiKey) return false;
        try {
            const res = await fetch('https://api-free.deepl.com/v2/usage', {
                headers: { Authorization: `DeepL-Auth-Key ${this.config.apiKey}` },
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    public async Translate(text: string, options: TranslateOptions): Promise<string> {
        const target = options.targetLang.toUpperCase() === 'VI' ? 'VI' : options.targetLang.toUpperCase();
        const res = await fetch('https://api-free.deepl.com/v2/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `DeepL-Auth-Key ${this.config.apiKey}`,
            },
            body: JSON.stringify({ text: [text], target_lang: target }),
        });
        if (!res.ok) throw new Error(`DeepL translate failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as { translations: { text: string }[] };
        return data.translations[0]?.text ?? text;
    }
}
