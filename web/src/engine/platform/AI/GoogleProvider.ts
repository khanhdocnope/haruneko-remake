import type { IAITranslationProvider, TranslateOptions } from './AITranslationProvider';

export class GoogleProvider implements IAITranslationProvider {

    public readonly ID = 'google' as const;
    public readonly Label = 'Google';

    public async Test(): Promise<boolean> {
        return true;
    }

    public async Translate(text: string, options: TranslateOptions): Promise<string> {
        const target = options.targetLang.toLowerCase().split('-')[0];
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Google translate failed: ${res.status}`);
        const data = await res.json() as unknown[];
        // Response format: [[[translated, original]]]
        const arr = data[0] as unknown[][];
        return (arr[0]?.[0] as string) ?? text;
    }
}
